/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';

/**
 * Represents a player's state for tracking their moves.
 */
interface PlayerState {
    // Cards from previous move (for cleanup in rules 3-A/B)
    previousCards: number[];  // positions of cards
    previousMatched: boolean; // whether they matched
    // Cards currently controlled (0, 1, or 2 cards)
    currentCards: number[];   // positions of cards currently controlled
}

/**
 * Mutable board for Memory Scramble game.
 * Represents a grid of card spaces that players can flip to find matching pairs.
 * Mutable and concurrency safe.
 */
export class Board {

    private readonly rows: number;
    private readonly columns: number;
    private readonly cards: (string | null)[]; // null = empty space, string = card value
    private readonly faceUp: boolean[];        // faceUp[i] = true if card at position i is face up
    private readonly controlledBy: (string | null)[]; // controlledBy[i] = playerId or null
    private readonly playerStates: Map<string, PlayerState>; // track each player's state
    private readonly waitingPlayers: Map<number, Array<{playerId: string, resolve: () => void}>>; // players waiting for a card
    private readonly watchers: Array<() => void>; // watchers waiting for board changes

    // Abstraction function:
    //   AF(rows, columns, cards, faceUp, controlledBy, playerStates, waitingPlayers) =
    //     a Memory Scramble game board with 'rows' rows and 'columns' columns,
    //     where cards[i] represents the card at position (row=i÷columns, col=i%columns)
    //     null represents an empty space, string represents a card with that label
    //     faceUp[i] indicates if the card is visible to all players
    //     controlledBy[i] indicates which player controls the card (if any)
    //     playerStates tracks each player's current and previous move state
    //     waitingPlayers tracks players waiting to control specific cards (rule 1-D)
    // Representation invariant:
    //   rows > 0
    //   columns > 0
    //   cards.length === rows * columns
    //   faceUp.length === rows * columns
    //   controlledBy.length === rows * columns
    //   all cards are either null or non-empty strings of non-whitespace characters
    //   if cards[i] is null, then faceUp[i] is false and controlledBy[i] is null
    //   if controlledBy[i] is not null, then faceUp[i] is true and cards[i] is not null
    //   for each player in playerStates, currentCards.length <= 2
    //   waitingPlayers keys are valid positions [0, rows*columns)
    // Safety from rep exposure:
    //   rows and columns are readonly and immutable (number)
    //   all arrays are private and readonly references, but contents are mutable (by design)
    //   playerStates and waitingPlayers are private and mutable
    //   methods return defensive copies or formatted strings, never direct references to mutable state

    /**
     * Create a new board.
     *
     * @param rows number of rows, must be > 0
     * @param columns number of columns, must be > 0
     * @param cards array of cards in row-major order, length must equal rows*columns
     */
    private constructor(rows: number, columns: number, cards: (string | null)[]) {
        this.rows = rows;
        this.columns = columns;
        this.cards = cards;

        // Initialize game state - all cards start face down, no one controls anything
        const size = rows * columns;
        this.faceUp = Array.from({ length: size }, () => false);
        this.controlledBy = Array.from({ length: size }, () => null);
        this.playerStates = new Map();
        this.waitingPlayers = new Map();
        this.watchers = [];

        this.checkRep();
    }

    /**
     * Check the representation invariant.
     */
    private checkRep(): void {
        const size = this.rows * this.columns;

        assert(this.rows > 0, 'rows must be positive');
        assert(this.columns > 0, 'columns must be positive');
        assert(this.cards.length === size, 'cards array length must match dimensions');
        assert(this.faceUp.length === size, 'faceUp array length must match dimensions');
        assert(this.controlledBy.length === size, 'controlledBy array length must match dimensions');

        for (let i = 0; i < size; i++) {
            const card = this.cards[i];
            if (card !== null && card !== undefined) {
                assert(card.length > 0, 'card must be non-empty');
                assert(!/\s/.test(card), 'card must not contain whitespace');
            } else if (card === null) {
                // Empty space: must not be face up or controlled
                assert(this.faceUp[i] === false, 'empty space cannot be face up');
                assert(this.controlledBy[i] === null, 'empty space cannot be controlled');
            }

            // If controlled, must be face up and have a card
            if (this.controlledBy[i] !== null) {
                assert(this.faceUp[i] === true, 'controlled card must be face up');
                assert(card !== null && card !== undefined, 'controlled position must have a card');
            }
        }

        // Check player states
        for (const state of this.playerStates.values()) {
            assert(state.currentCards.length <= 2, 'player can control at most 2 cards');
        }
    }

    /**
     * Get string representation of the board for debugging.
     *
     * @returns string representation showing dimensions and cards
     */
    public toString(): string {
        let result = `${this.rows}x${this.columns}\n`;
        for (const card of this.cards) {
            result += card ?? 'none';
            result += '\n';
        }
        return result;
    }

    /**
     * Convert (row, column) coordinates to array position.
     *
     * @param row row number, 0-indexed
     * @param column column number, 0-indexed
     * @returns array position
     */
    private getPosition(row: number, column: number): number {
        return row * this.columns + column;
    }

    /**
     * Get the current state of the board from a player's perspective.
     *
     * @param playerId ID of the player viewing the board
     * @returns formatted board state string (ROWxCOLUMN format with SPOT per line)
     */
    public getBoardState(playerId: string): string {
        let result = `${this.rows}x${this.columns}\n`;

        for (let i = 0; i < this.cards.length; i++) {
            const card = this.cards[i];

            if (card === null) {
                result += 'none\n';
            } else if (this.faceUp[i] === false) {
                result += 'down\n';
            } else if (this.controlledBy[i] === playerId) {
                result += `my ${card}\n`;
            } else {
                result += `up ${card}\n`;
            }
        }

        return result;
    }

    /**
     * Flip a card on the board following the game rules.
     *
     * @param playerId ID of the player flipping the card
     * @param row row number of card to flip
     * @param column column number of card to flip
     * @returns promise that resolves when flip is complete
     * @throws Error if the flip operation fails per game rules
     */
    public async flipCard(playerId: string, row: number, column: number): Promise<void> {
        // Validate coordinates
        if (row < 0 || row >= this.rows || column < 0 || column >= this.columns) {
            throw new Error('Invalid coordinates');
        }

        const position = this.getPosition(row, column);

        // Get or create player state
        if (!this.playerStates.has(playerId)) {
            this.playerStates.set(playerId, {
                previousCards: [],
                previousMatched: false,
                currentCards: []
            });
        }

        const playerState = this.playerStates.get(playerId);
        if (playerState === undefined) throw new Error('Player state not found');

        const numControlled = playerState.currentCards.length;

        // Rule 3: Cleanup from previous move (if starting a new first card)
        if (numControlled === 0 && (playerState.previousCards.length > 0)) {
            let boardChanged = false;
            if (playerState.previousMatched) {
                // Rule 3-A: Remove matched cards
                for (const pos of playerState.previousCards) {
                    if (this.cards[pos] !== null) {
                        this.cards[pos] = null;
                        this.faceUp[pos] = false;
                        this.controlledBy[pos] = null;
                        boardChanged = true;
                        // Wake up any players waiting for this card
                        this.notifyWaitingPlayers(pos);
                    }
                }
            } else {
                // Rule 3-B: Turn face down non-matching cards (if still uncontrolled)
                for (const pos of playerState.previousCards) {
                    if (this.cards[pos] !== null && this.faceUp[pos] === true && this.controlledBy[pos] === null) {
                        this.faceUp[pos] = false;
                        boardChanged = true;
                    }
                }
            }
            // Clear previous move
            playerState.previousCards = [];
            playerState.previousMatched = false;

            // Notify watchers if board changed
            if (boardChanged) {
                this.notifyWatchers();
            }
        }

        // FIRST CARD (rules 1-A through 1-D)
        if (numControlled === 0) {
            // Rule 1-A: No card there
            if (this.cards[position] === null) {
                throw new Error('No card at that position');
            }

            // Rule 1-D: Card controlled by another player - WAIT
            while (this.controlledBy[position] !== null && this.controlledBy[position] !== playerId) {
                await new Promise<void>((resolve) => {
                    const waitList = this.waitingPlayers.get(position) ?? [];
                    waitList.push({ playerId, resolve });
                    this.waitingPlayers.set(position, waitList);
                });
            }

            // Check again after waiting - card might have been removed
            if (this.cards[position] === null) {
                throw new Error('No card at that position');
            }

            // Rule 1-B: Face down - turn it face up
            if (this.faceUp[position] === false) {
                this.faceUp[position] = true;
                this.notifyWatchers(); // Card flipped face up
            }

            // Rule 1-C: Face up but not controlled - take control
            // (or Rule 1-B continuation)
            this.controlledBy[position] = playerId;
            playerState.currentCards.push(position);

        } else if (numControlled === 1) {
            // SECOND CARD (rules 2-A through 2-E)

            // Rule 2-A: No card there
            if (this.cards[position] === null) {
                // Relinquish control of first card
                const firstPos = playerState.currentCards[0];
                if (firstPos === undefined) throw new Error('First card position not found');
                this.controlledBy[firstPos] = null;
                this.notifyWaitingPlayers(firstPos);
                playerState.previousCards = [firstPos];
                playerState.previousMatched = false;
                playerState.currentCards = [];
                throw new Error('No card at that position');
            }

            // Rule 2-B: Card is controlled (no waiting, to avoid deadlock)
            if (this.controlledBy[position] !== null) {
                // Relinquish control of first card
                const firstPos = playerState.currentCards[0];
                if (firstPos === undefined) throw new Error('First card position not found');
                this.controlledBy[firstPos] = null;
                this.notifyWaitingPlayers(firstPos);
                playerState.previousCards = [firstPos];
                playerState.previousMatched = false;
                playerState.currentCards = [];
                throw new Error('Card is controlled by a player');
            }

            // Rule 2-C: Turn face up if face down
            if (this.faceUp[position] === false) {
                this.faceUp[position] = true;
                this.notifyWatchers(); // Card flipped face up
            }

            // Check if cards match
            const firstPos = playerState.currentCards[0];
            if (firstPos === undefined) throw new Error('First card position not found');
            const firstCard = this.cards[firstPos];
            const secondCard = this.cards[position];

            if (firstCard === secondCard) {
                // Rule 2-D: MATCH! Keep control of both
                this.controlledBy[position] = playerId;
                playerState.currentCards.push(position);
                playerState.previousCards = [firstPos, position];
                playerState.previousMatched = true;
                playerState.currentCards = []; // Relinquish control for cleanup later
            } else {
                // Rule 2-E: NO MATCH - relinquish control of both
                this.controlledBy[firstPos] = null;
                this.notifyWaitingPlayers(firstPos);
                playerState.previousCards = [firstPos, position];
                playerState.previousMatched = false;
                playerState.currentCards = [];
            }
        } else {
            throw new Error('Player already controls 2 cards');
        }

        this.checkRep();
    }

    /**
     * Notify waiting players that a card is now available.
     *
     * @param position position of the card that's now available
     */
    private notifyWaitingPlayers(position: number): void {
        const waitList = this.waitingPlayers.get(position);
        if (waitList && waitList.length > 0) {
            // Wake up one waiting player
            const next = waitList.shift();
            if (next) {
                next.resolve();
            }
        }
    }

    /**
     * Notify all watchers that the board has changed.
     * Changes include: cards flipping face up/down, being removed, or changing value.
     */
    private notifyWatchers(): void {
        // Wake up all watchers
        while (this.watchers.length > 0) {
            const watcher = this.watchers.shift();
            if (watcher !== undefined) {
                watcher();
            }
        }
    }

    /**
     * Wait for the board to change.
     * Resolves when any card turns face up/down, is removed, or changes value.
     *
     * @returns promise that resolves when the board changes
     */
    public async waitForChange(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.watchers.push(resolve);
        });
    }

    /**
     * Apply a transformer function to all cards on the board.
     * Maintains pairwise consistency: matching cards are transformed together atomically.
     * Allows interleaving with other operations.
     *
     * @param f async transformer function from card to card
     */
    public async mapCards(f: (card: string) => Promise<string>): Promise<void> {
        // Collect all unique card values (excluding null/empty spaces)
        const uniqueCards = new Set<string>();
        for (const card of this.cards) {
            if (card !== null) {
                uniqueCards.add(card);
            }
        }

        // Transform each unique card value and cache results
        // This ensures pairwise consistency: all cards with the same value get the same new value
        const transformCache = new Map<string, string>();
        for (const card of uniqueCards) {
            const newCard = await f(card);
            transformCache.set(card, newCard);
        }

        // Apply transformations atomically to maintain consistency
        // Group positions by their original card value
        const cardGroups = new Map<string, number[]>();
        for (let i = 0; i < this.cards.length; i++) {
            const card = this.cards[i];
            if (card !== null && card !== undefined) {
                const positions = cardGroups.get(card) ?? [];
                positions.push(i);
                cardGroups.set(card, positions);
            }
        }

        // Update all cards with the same value atomically (as a group)
        let anyChanged = false;
        for (const [oldCard, positions] of cardGroups.entries()) {
            const newCard = transformCache.get(oldCard);
            if (newCard !== undefined && newCard !== oldCard) {
                // Update all positions with this card value at once
                for (const pos of positions) {
                    this.cards[pos] = newCard;
                }
                anyChanged = true;
            }
        }

        // Notify watchers if any cards changed
        if (anyChanged) {
            this.notifyWatchers();
        }

        this.checkRep();
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
        const lines = content.split(/\r?\n/).filter(line => line.length > 0);

        if (lines.length < 2) {
            throw new Error('Board file must have dimension line and at least one card');
        }

        // Parse dimensions (first line: "ROWxCOLUMN")
        const firstLine = lines[0];
        if (firstLine === undefined) {
            throw new Error('Board file must have dimension line');
        }

        const dimensionMatch = firstLine.match(/^(\d+)x(\d+)$/);
        if (!dimensionMatch) {
            throw new Error('First line must be in format ROWxCOLUMN');
        }

        const [, rowStr, colStr] = dimensionMatch;
        if (rowStr === undefined || colStr === undefined) {
            throw new Error('First line must be in format ROWxCOLUMN');
        }

        const rows = parseInt(rowStr);
        const columns = parseInt(colStr);

        if (rows <= 0 || columns <= 0) {
            throw new Error('Rows and columns must be positive');
        }

        // Parse cards (remaining lines)
        const cardLines = lines.slice(1);
        const expectedCards = rows * columns;

        if (cardLines.length !== expectedCards) {
            throw new Error(`Expected ${expectedCards} cards but found ${cardLines.length}`);
        }

        // Validate each card (non-empty, no whitespace)
        const cards: (string | null)[] = [];
        for (const cardLine of cardLines) {
            if (cardLine.length === 0) {
                throw new Error('Card must be non-empty');
            }
            if (/\s/.test(cardLine)) {
                throw new Error('Card must not contain whitespace');
            }
            cards.push(cardLine);
        }

        return new Board(rows, columns, cards);
    }
}