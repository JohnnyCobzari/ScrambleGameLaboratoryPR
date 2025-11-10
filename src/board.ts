/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { Mutex } from 'async-mutex';

/**
 * A mutable and concurrency-safe Memory Scramble game board.
 *
 * The board maintains a rectangular grid of cards that players can flip
 * to find matching pairs. Multiple players can interact with the board
 * simultaneously following the Memory Scramble game rules.
 */
export class Board {

    // Representation
    private readonly cards: Array<CardSpace>;
    private readonly rows: number;
    private readonly cols: number;
    private readonly playerState: Map<string, PlayerControl>;
    private readonly mutex: Mutex;
    private readonly changeListeners: Array<() => void>;
    private boardVersion: number; // increments on every visible change

    // Abstraction function:
    //   AF(cards, rows, cols, playerState, boardVersion) =
    //     A rows × cols grid of card spaces where position (r,c) maps to cards[r * cols + c].
    //     Each space is either:
    //       - Empty (null)
    //       - Contains a card with value and state (face-down or face-up)
    //     playerState maps each active player ID to:
    //       - The positions they currently control (0, 1, or 2 positions)
    //     boardVersion tracks the number of observable changes for watch() functionality
    //
    // Representation invariant:
    //   - cards.length === rows * cols
    //   - rows > 0 and cols > 0
    //   - For each CardSpace in cards:
    //     - If not null: card is non-empty string, state is 'up' or 'down'
    //   - For each player in playerState:
    //     - controlled.size is 0, 1, or 2
    //     - All positions in controlled are valid indices in [0, cards.length)
    //     - All positions in controlled point to non-null CardSpace
    //     - If controlled.size === 2, both cards have the same value
    //   - No two players control the same position
    //   - If a CardSpace has state 'up', it may be in at most one player's controlled set
    //   - boardVersion >= 0
    //   - changeListeners contains only functions
    //
    // Safety from rep exposure:
    //   - All fields are private
    //   - rows, cols, boardVersion are primitives (immutable)
    //   - cards is mutable but never returned; look() returns a string copy
    //   - playerState is mutable but never exposed; all access is internal
    //   - mutex is never exposed to clients
    //   - changeListeners is mutable but never exposed
    //   - All public methods return strings (immutable) or void
    //   - Therefore, clients cannot access or mutate the representation

    /**
     * Create a new Board with the given dimensions and cards.
     *
     * @param rows number of rows; must be > 0
     * @param cols number of columns; must be > 0
     * @param cardValues array of card values; length must equal rows * cols
     */
    private constructor(rows: number, cols: number, cardValues: Array<string | null>) {
        assert(rows > 0, 'rows must be positive');
        assert(cols > 0, 'cols must be positive');
        assert(cardValues.length === rows * cols, 'cardValues length must match grid size');

        this.rows = rows;
        this.cols = cols;
        this.cards = cardValues.map(value =>
            value === null ? null : { card: value, state: 'down' as const }
        );
        this.playerState = new Map();
        this.mutex = new Mutex();
        this.changeListeners = [];
        this.boardVersion = 0;

        this.checkRep();
    }

    /**
     * Check the representation invariant.
     * Throws an error if the representation is invalid.
     */
    private checkRep(): void {
        assert(this.cards.length === this.rows * this.cols, 'cards length must match grid size');
        assert(this.rows > 0, 'rows must be positive');
        assert(this.cols > 0, 'cols must be positive');
        assert(this.boardVersion >= 0, 'boardVersion must be non-negative');

        // Check each card space
        for (const space of this.cards) {
            if (space !== null) {
                assert(space.card.length > 0, 'card value must be non-empty');
                assert(space.state === 'up' || space.state === 'down', 'card state must be up or down');
            }
        }

        // Check player state consistency
        const controlledPositions = new Set<number>();
        for (const [_playerId, control] of this.playerState) {
            assert(control.controlled.size <= 2, 'player can control at most 2 cards');

            // Check all controlled positions are valid
            for (const pos of control.controlled) {
                assert(pos >= 0 && pos < this.cards.length, 'controlled position must be valid');
                assert(this.cards[pos] !== null, 'controlled position must have a card');
                assert(!controlledPositions.has(pos), 'no position can be controlled by multiple players');
                controlledPositions.add(pos);
            }

            // If player controls 2 cards, they must match
            if (control.controlled.size === 2) {
                const positions = Array.from(control.controlled);
                assert(positions.length === 2, 'should have exactly 2 positions');
                const pos1 = positions[0];
                const pos2 = positions[1];
                assert(pos1 !== undefined && pos2 !== undefined, 'positions should be defined');
                const card1 = this.cards[pos1];
                const card2 = this.cards[pos2];
                assert(card1 !== null && card1 !== undefined && card2 !== null && card2 !== undefined, 'controlled cards must exist');
                assert(card1.card === card2.card, 'controlled pair must match');
            }
        }
    }

    /**
     * Make a new board by parsing a file.
     *
     * PS4 instructions: the specification of this method may not be changed.
     *
     * @param filename path to game board file
     * @returns a new board with the size and cards from the file
     * @throws Error if the file cannot be read or is not a valid game board
     */
    public static async parseFromFile(filename: string): Promise<Board> {
        const content = await fs.promises.readFile(filename, 'utf-8');
        const lines = content.trim().split(/\r?\n/);

        if (lines.length === 0) {
            throw new Error('Empty board file');
        }

        // Parse dimensions from first line (e.g., "5x5")
        const firstLine = lines[0];
        assert(firstLine !== undefined, 'first line must exist');
        const dimensionMatch = firstLine.match(/^(\d+)x(\d+)$/);
        if (!dimensionMatch) {
            throw new Error('Invalid board format: first line must be ROWSxCOLS');
        }

        const rowStr = dimensionMatch[1];
        const colStr = dimensionMatch[2];
        assert(rowStr !== undefined && colStr !== undefined, 'dimensions must be defined');
        const rows = parseInt(rowStr);
        const cols = parseInt(colStr);

        if (rows <= 0 || cols <= 0) {
            throw new Error('Board dimensions must be positive');
        }

        const expectedCards = rows * cols;
        const cardLines = lines.slice(1);

        if (cardLines.length !== expectedCards) {
            throw new Error(`Expected ${expectedCards} cards, got ${cardLines.length}`);
        }

        // Parse card values (each line is one card)
        const cardValues = cardLines.map(line => {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
                throw new Error('Card value cannot be empty');
            }
            if (/\s/.test(trimmed)) {
                throw new Error('Card value cannot contain whitespace');
            }
            return trimmed;
        });

        return new Board(rows, cols, cardValues);
    }

    /**
     * Get the current state of the board from a player's perspective.
     *
     * @param playerId ID of the player; must be nonempty string of alphanumeric or underscore chars
     * @returns board state string in the format:
     *          "ROWSxCOLS\nspot1\nspot2\n..."
     *          where each spot is one of:
     *          - "none" (empty space)
     *          - "down" (face-down card)
     *          - "up CARD" (face-up card not controlled by playerId)
     *          - "my CARD" (face-up card controlled by playerId)
     */
    public look(playerId: string): string {
        assert(/^[a-zA-Z0-9_]+$/.test(playerId), 'playerId must be alphanumeric or underscore');

        const playerControl = this.playerState.get(playerId);
        const controlledPositions = playerControl?.controlled ?? new Set<number>();

        const spots: string[] = [`${this.rows}x${this.cols}`];

        for (let i = 0; i < this.cards.length; i++) {
            const space = this.cards[i];
            assert(space !== undefined, 'card space must be defined');

            if (space === null) {
                spots.push('none');
            } else if (space.state === 'down') {
                spots.push('down');
            } else {
                // Card is face-up
                if (controlledPositions.has(i)) {
                    spots.push(`my ${space.card}`);
                } else {
                    spots.push(`up ${space.card}`);
                }
            }
        }

        return spots.join('\n');
    }

    /**
     * Attempt to flip a card at the given position.
     * Follows Memory Scramble game rules:
     * - First card: gains control if possible, waits if controlled by another
     * - Second card: matches are kept controlled, non-matches lose control
     * - Matched pairs are removed from the board
     * - Non-matching pairs flip back to face-down when no longer controlled
     *
     * @param playerId ID of player flipping; must be nonempty string of alphanumeric or underscore chars
     * @param row row of card; must be in [0, rows)
     * @param col column of card; must be in [0, cols)
     * @returns promise that resolves to board state string after flip
     * @throws Error if flip fails (empty space, already controlled by player, etc.)
     */
    public async flip(playerId: string, row: number, col: number): Promise<string> {
        assert(/^[a-zA-Z0-9_]+$/.test(playerId), 'playerId must be alphanumeric or underscore');
        assert(Number.isInteger(row) && row >= 0 && row < this.rows, 'row must be valid');
        assert(Number.isInteger(col) && col >= 0 && col < this.cols, 'col must be valid');

        const position = row * this.cols + col;

        // Wait until we can proceed with the flip
        while (true) {
            const result = await this.mutex.runExclusive(async () => {
                return await this.tryFlip(playerId, position);
            });

            if (result.success) {
                await this.mutex.runExclusive(async () => {
                    this.checkRep();
                });
                return this.look(playerId);
            }
            if (result.shouldWait === true) {
                // Release lock and wait for a change
                await this.waitForChange();
            } else {
                // Flip failed permanently
                throw new Error(result.error ?? 'Flip failed');
            }
        }
    }

    /**
     * Try to flip a card. Returns whether the flip succeeded, failed, or should wait.
     */
    private async tryFlip(playerId: string, position: number): Promise<FlipResult> {
        const space = this.cards[position];

        // Ensure space is defined (position should always be valid)
        if (space === undefined) {
            throw new Error('Invalid position: space is undefined');
        }

        // Rule: Cannot flip empty space
        if (space === null) {
            return { success: false, shouldWait: false, error: 'Cannot flip empty space' };
        }

        let playerControl = this.playerState.get(playerId);
        if (!playerControl) {
            playerControl = { controlled: new Set() };
            this.playerState.set(playerId, playerControl);
        }

        const controlledCount = playerControl.controlled.size;

        // Flipping first card
        if (controlledCount === 0) {
            return this.flipFirstCard(playerId, position, space, playerControl);
        }
        // Flipping second card
        else if (controlledCount === 1) {
            return this.flipSecondCard(playerId, position, space, playerControl);
        }
        // Player already controls 2 cards (matched pair waiting to be removed)
        else {
            // Remove the matched pair first
            await this.removeMatchedPair(playerId, playerControl);
            // Then try flipping again
            return this.tryFlip(playerId, position);
        }
    }

    /**
     * Handle flipping the first card.
     */
    private flipFirstCard(
        playerId: string,
        position: number,
        space: CardSpace,
        playerControl: PlayerControl
    ): FlipResult {
        assert(space !== null, 'space must not be null for first card');

        // Check if another player controls this card
        if (this.isControlledByOther(position, playerId)) {
            // Rule 1-D: Wait until we can control it
            return { success: false, shouldWait: true };
        }

        // Flip face-down cards of other players back down if uncontrolled
        this.flipDownUncontrolledCards();

        // Rule 1-B: Face-down card -> turn face-up, gain control
        // Rule 1-C: Face-up uncontrolled -> remain face-up, gain control
        if (space.state === 'down') {
            space.state = 'up';
        }
        playerControl.controlled.add(position);
        this.notifyChange();

        return { success: true };
    }

    /**
     *
     *
     * Handle flipping the second card.
     */
    private flipSecondCard(
        playerId: string,
        position: number,
        space: CardSpace,
        playerControl: PlayerControl
    ): FlipResult {
        // Rule 2-B: Cannot flip a card already controlled by this player
        if (playerControl.controlled.has(position)) {
            playerControl.controlled.clear();
            this.notifyChange();
            return { success: false, shouldWait: false, error: 'Cannot flip card you already control' };
        }

        // Rule 2-A: Cannot flip empty space as second card
        if (space === null) {
            playerControl.controlled.clear();
            this.notifyChange();
            return { success: false, shouldWait: false, error: 'Cannot flip empty space' };
        }

        const firstPositionArray = Array.from(playerControl.controlled);
        assert(firstPositionArray.length === 1, 'should have exactly one controlled card');
        const firstPosition = firstPositionArray[0];
        assert(firstPosition !== undefined, 'first position must be defined');
        const firstCard = this.cards[firstPosition];
        assert(firstCard !== null && firstCard !== undefined, 'first card must exist');

        // Turn face-down card face-up
        if (space.state === 'down') {
            space.state = 'up';
        }

        // Rule 2-D: Cards match -> maintain control
        if (firstCard.card === space.card) {
            playerControl.controlled.add(position);
            this.notifyChange();
            return { success: true };
        }
        // Rule 2-E: Cards don't match -> relinquish control, cards stay face-up
        else {
            playerControl.controlled.clear();
            this.notifyChange();
            return { success: true };
        }
    }

    /**
     * Remove a matched pair controlled by a player.
     */
    private async removeMatchedPair(playerId: string, playerControl: PlayerControl): Promise<void> {
        assert(playerControl.controlled.size === 2, 'must have matched pair');

        // Rule 3-A: Remove matched cards from board
        for (const pos of playerControl.controlled) {
            this.cards[pos] = null;
        }
        playerControl.controlled.clear();
        this.notifyChange();
    }

    /**
     * Flip down any face-up cards that are not controlled by any player.
     */
    private flipDownUncontrolledCards(): void {
        // Rule 3-B: Non-matching cards that are still face-up and uncontrolled turn face-down
        const allControlled = new Set<number>();
        for (const control of this.playerState.values()) {
            for (const pos of control.controlled) {
                allControlled.add(pos);
            }
        }

        let changed = false;
        for (let i = 0; i < this.cards.length; i++) {
            const space = this.cards[i];
            assert(space !== undefined, 'card space must be defined');
            if (space !== null && space.state === 'up' && !allControlled.has(i)) {
                space.state = 'down';
                changed = true;
            }
        }

        if (changed) {
            this.notifyChange();
        }
    }

    /**
     * Check if a position is controlled by a player other than the given player.
     */
    private isControlledByOther(position: number, playerId: string): boolean {
        for (const [pid, control] of this.playerState) {
            if (pid !== playerId && control.controlled.has(position)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Modify board by replacing every card with f(card).
     * Maintains pairwise consistency: matching cards stay matched during transformation.
     *
     * @param playerId ID of player applying the map
     * @param f function to transform each card value; must return consistent results for same input
     * @returns board state after transformation
     */
    public async map(playerId: string, f: (card: string) => Promise<string>): Promise<string> {
        assert(/^[a-zA-Z0-9_]+$/.test(playerId), 'playerId must be alphanumeric or underscore');

        return this.mutex.runExclusive(async () => {
            // Build a mapping from old card values to new card values
            const cardMapping = new Map<string, string>();

            // Collect all unique card values
            const uniqueCards = new Set<string>();
            for (const space of this.cards) {
                if (space !== null) {
                    uniqueCards.add(space.card);
                }
            }

            // Transform each unique card value once (ensuring consistency)
            for (const card of uniqueCards) {
                const newCard = await f(card);
                if (newCard.length === 0 || /\s/.test(newCard)) {
                    throw new Error('Transformed card must be non-empty and contain no whitespace');
                }
                cardMapping.set(card, newCard);
            }

            // Apply the transformation atomically to all cards
            for (const space of this.cards) {
                if (space !== null) {
                    const newValue = cardMapping.get(space.card);
                    assert(newValue !== undefined, 'all cards should have been transformed');
                    space.card = newValue;
                }
            }

            this.notifyChange();
            this.checkRep();
            return this.look(playerId);
        });
    }

    /**
     * Watch the board for a change.
     * Waits until any cards turn face up or face down, are removed, or change values.
     *
     * @param playerId ID of player watching
     * @returns promise that resolves to updated board state when a change occurs
     */
    public async watch(playerId: string): Promise<string> {
        assert(/^[a-zA-Z0-9_]+$/.test(playerId), 'playerId must be alphanumeric or underscore');

        const initialVersion = this.boardVersion;

        // Wait until board version changes
        while (this.boardVersion === initialVersion) {
            await this.waitForChange();
        }

        return this.look(playerId);
    }

    /**
     * Wait for the next board change.
     * Returns a promise that resolves when notifyChange() is called.
     */
    private waitForChange(): Promise<void> {
        return new Promise((resolve) => {
            this.changeListeners.push(resolve);
        });
    }

    /**
     * Notify all listeners that the board has changed.
     */
    private notifyChange(): void {
        this.boardVersion++;
        const listeners = [...this.changeListeners];
        this.changeListeners.length = 0; // Clear array
        listeners.forEach(listener => listener());
    }
}

/**
 * Represents a space on the board that contains a card.
 */
type CardSpace = {
    card: string;
    state: 'up' | 'down';
} | null;

/**
 * Tracks which cards a player currently controls.
 */
type PlayerControl = {
    controlled: Set<number>; // positions of controlled cards
};

/**
 * Result of attempting to flip a card.
 */
type FlipResult = {
    success: boolean;
    shouldWait?: boolean;
    error?: string;
};
