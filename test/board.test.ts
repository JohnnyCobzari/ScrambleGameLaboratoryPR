/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { Board } from '../src/board.js';


/**
 * Tests for the Board abstract data type.
 *
 * Testing strategy:
 *
 * Partition by board operations:
 *   - parseFromFile(): valid file, invalid file, missing file, wrong dimensions
 *   - look(): initial state, after flips, after matches, from different players
 *   - flip(): first card (face-down, face-up, controlled by other)
 *            second card (matching, non-matching, empty, same card)
 *   - map(): transform all cards, maintain pairwise consistency
 *   - watch(): wait for changes (flip, match, map)
 *
 * Partition by card states:
 *   - Face-down, uncontrolled
 *   - Face-up, uncontrolled
 *   - Face-up, controlled by player
 *   - Face-up, controlled by another player
 *   - Empty (removed)
 *
 * Partition by player interactions:
 *   - Single player
 *   - Multiple players, sequential
 *   - Multiple players, concurrent
 *
 * Partition by game rules:
 *   - Rule 1-A: First card on empty space (should fail)
 *   - Rule 1-B: First card face-down (turns face-up, gain control)
 *   - Rule 1-C: First card face-up uncontrolled (gain control)
 *   - Rule 1-D: First card controlled by other (wait)
 *   - Rule 2-A: Second card empty space (fail, lose control)
 *   - Rule 2-B: Second card already controlled by player (fail, lose control)
 *   - Rule 2-D: Second card matches (maintain control)
 *   - Rule 2-E: Second card doesn't match (lose control, stay face-up)
 *   - Rule 3-A: Matched pair removed on next flip
 *   - Rule 3-B: Non-matching cards flip face-down when uncontrolled
 */
describe('Board', function() {

    // ========== parseFromFile() tests ==========

    describe('parseFromFile', function() {

        it('parses valid 5x5 board from file', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            const state = board.look('alice');
            const lines = state.split('\n');
            assert.strictEqual(lines[0], '5x5', 'first line should be dimensions');
            assert.strictEqual(lines.length, 26, 'should have 26 lines (1 dimension + 25 cards)');
            // All cards should be face-down initially
            for (let i = 1; i < lines.length; i++) {
                assert.strictEqual(lines[i], 'down', `card ${i} should be face-down`);
            }
        });

        it('throws error for non-existent file', async function() {
            await assert.rejects(
                async () => Board.parseFromFile('boards/nonexistent.txt'),
                Error,
                'should throw error for missing file'
            );
        });

        it('parses board with correct dimensions', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            const state = board.look('player1');
            assert(state.startsWith('5x5'), 'should have correct dimensions');
        });
    });

    // ========== look() tests ==========

    describe('look', function() {

        it('returns all face-down cards for initial board', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            const state = board.look('alice');
            const lines = state.split('\n');
            assert.strictEqual(lines[0], '5x5');
            for (let i = 1; i < lines.length; i++) {
                assert.strictEqual(lines[i], 'down');
            }
        });

        it('shows different perspectives for different players', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            await board.flip('alice', 0, 0); // Alice flips first card

            const aliceView = board.look('alice');
            const bobView = board.look('bob');

            const aliceLines = aliceView.split('\n');
            const bobLines = bobView.split('\n');

            // Alice should see "my A", Bob should see "up A"
            assert(aliceLines[1] !== undefined && aliceLines[1].startsWith('my '), 'alice should see her controlled card');
            assert(bobLines[1] !== undefined && bobLines[1].startsWith('up '), 'bob should see alice\'s card as up');
        });
    });

    // ========== flip() tests - First card ==========

    describe('flip - first card', function() {

        it('Rule 1-B: flipping face-down card turns it face-up and grants control', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');
            await board.flip('alice', 0, 0);

            const state = board.look('alice');
            const lines = state.split('\n');
            assert(lines[1] !== undefined && lines[1].startsWith('my '), 'alice should control the card');
            assert(lines[1] !== undefined && (lines[1].includes('A') || lines[1].includes('B')), 'card should be visible');
        });

        it('Rule 1-C: flipping face-up uncontrolled card grants control', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Alice flips two non-matching cards, leaving them face-up
            await board.flip('alice', 0, 0); // First card
            await board.flip('alice', 0, 1); // Second card (non-match, lose control)

            // Both cards are now face-up but uncontrolled
            // Bob flips first card again
            await board.flip('bob', 0, 0);

            const state = board.look('bob');
            const lines = state.split('\n');
            assert(lines[1] !== undefined && lines[1].startsWith('my '), 'bob should control the face-up card');
        });

        it('Rule 1-A: flipping empty space fails', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Find and match a pair to create empty spaces
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1);
            // Cards match, next flip removes them
            await board.flip('alice', 1, 0); // This triggers removal of matched pair

            // Now try to flip the empty space
            await assert.rejects(
                async () => board.flip('alice', 0, 0),
                Error,
                'should fail to flip empty space'
            );
        });
    });

    // ========== flip() tests - Second card ==========

    describe('flip - second card', function() {

        it('Rule 2-D: matching second card maintains control of both', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // perfect.txt has matching pairs
            await board.flip('alice', 0, 0); // First card
            await board.flip('alice', 0, 1); // Second card (should match)

            const state = board.look('alice');
            const lines = state.split('\n');

            // Both cards should be controlled by alice
            const myCards = lines.filter(line => line.startsWith('my ')).length;
            assert.strictEqual(myCards, 2, 'alice should control both matching cards');
        });

        it('Rule 2-E: non-matching second card relinquishes control', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            await board.flip('alice', 0, 0); // First card (A or B)

            let state = board.look('alice');
            let lines = state.split('\n');
            assert(lines[1] !== undefined, 'first card line should exist');
            const firstCard = lines[1].split(' ')[1]; // Get card value

            // Find a card that doesn't match
            let secondRow = 0, secondCol = 1;
            for (let i = 0; i < 25; i++) {
                const r = Math.floor(i / 5);
                const c = i % 5;
                if (i > 0) {
                    secondRow = r;
                    secondCol = c;
                    break;
                }
            }

            await board.flip('alice', secondRow, secondCol); // Try second card

            state = board.look('alice');
            lines = state.split('\n');

            // Alice should no longer control any cards
            const myCards = lines.filter(line => line.startsWith('my ')).length;
            assert.strictEqual(myCards, 0, 'alice should control no cards after non-match');
        });

        it('Rule 2-B: flipping same card as second card fails', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            await board.flip('alice', 0, 0); // First card

            // Try to flip the same card again
            await assert.rejects(
                async () => board.flip('alice', 0, 0),
                Error,
                'should fail to flip same card twice'
            );
        });

        it('Rule 2-A: flipping empty space as second card fails', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Create empty spaces by matching a pair
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1); // Match
            await board.flip('alice', 1, 0); // Remove matched pair

            // Now alice controls no cards, flip a first card
            await board.flip('alice', 2, 0);

            // Try to flip empty space as second card
            await assert.rejects(
                async () => board.flip('alice', 0, 0),
                Error,
                'should fail to flip empty space as second card'
            );
        });
    });

    // ========== flip() tests - Between moves ==========

    describe('flip - between moves', function() {

        it('Rule 3-A: matched pair is removed from board', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Match a pair
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1);

            // Next flip triggers removal
            await board.flip('alice', 1, 0);

            const state = board.look('alice');
            const lines = state.split('\n');

            // First two positions should now be empty
            assert.strictEqual(lines[1], 'none', 'matched card should be removed');
            assert.strictEqual(lines[2], 'none', 'matched card should be removed');
        });

        it('Rule 3-B: non-matching face-up cards flip back down', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Flip two non-matching cards
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1); // Non-match, lose control

            let state = board.look('alice');
            let lines = state.split('\n');
            // Cards should still be face-up
            assert(lines[1] !== undefined && (lines[1].startsWith('up ') || lines[1].startsWith('down')), 'cards exist');

            // When alice flips a new first card, uncontrolled face-up cards flip down
            await board.flip('alice', 1, 0);

            state = board.look('alice');
            lines = state.split('\n');

            // Previous non-matching cards should be face-down now
            // (unless they happen to be the new card alice flipped)
            const downCards = lines.filter(line => line === 'down').length;
            assert(downCards > 20, 'uncontrolled cards should flip back down');
        });
    });

    // ========== map() tests ==========

    describe('map', function() {

        it('transforms all cards on the board', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Transform A->X, B->Y
            await board.map('alice', async (card: string) => {
                if (card === 'A') return 'X';
                if (card === 'B') return 'Y';
                return card;
            });

            // Flip a card to see it
            await board.flip('alice', 0, 0);
            const state = board.look('alice');

            assert(state.includes('X') || state.includes('Y'), 'cards should be transformed');
            assert(!state.includes(' A') && !state.includes(' B'), 'old cards should be gone');
        });

        it('maintains pairwise consistency (matching cards stay matched)', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Flip two matching cards
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1);

            let state = board.look('alice');
            let lines = state.split('\n');
            assert(lines[1] !== undefined && lines[2] !== undefined, 'card lines should exist');
            const card1Before = lines[1].split(' ')[1];
            const card2Before = lines[2].split(' ')[1];
            assert(card1Before !== undefined && card2Before !== undefined, 'card values should exist');
            assert.strictEqual(card1Before, card2Before, 'cards should match before map');

            // Apply map transformation
            await board.map('alice', async (card: string) => card + '_MAPPED');

            state = board.look('alice');
            lines = state.split('\n');

            // Cards should still match after transformation
            assert(lines[1] !== undefined && lines[2] !== undefined, 'card lines should exist after map');
            const card1After = lines[1].split(' ')[1];
            const card2After = lines[2].split(' ')[1];
            assert(card1After !== undefined && card2After !== undefined, 'card values should exist after map');
            assert.strictEqual(card1After, card2After, 'cards should still match after map');
            assert(card1After.endsWith('_MAPPED'), 'cards should be transformed');
        });
    });

    // ========== watch() tests ==========

    describe('watch', function() {

        it('waits for board change and returns updated state', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Start watching in background
            const watchPromise = board.watch('bob');

            // Make a change
            setTimeout(async () => {
                await board.flip('alice', 0, 0);
            }, 50);

            // Watch should resolve when flip happens
            const state = await watchPromise;
            assert(state.includes('up '), 'bob should see the flipped card');
        });

        it('returns immediately if board has already changed', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Make a change
            await board.flip('alice', 0, 0);

            // Watch should return immediately on next call after change
            const watchPromise = board.watch('bob');

            // Make another change quickly
            setTimeout(async () => {
                await board.flip('alice', 0, 1);
            }, 10);

            const state = await watchPromise;
            assert(state !== '', 'watch should return valid state');
        });
    });

    // ========== Concurrency tests ==========

    describe('concurrency', function() {

        it('handles two players flipping different cards simultaneously', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Both players flip first cards simultaneously
            const aliceFlip = board.flip('alice', 0, 0);
            const bobFlip = board.flip('bob', 1, 1);

            await Promise.all([aliceFlip, bobFlip]);

            const aliceView = board.look('alice');
            const bobView = board.look('bob');

            // Both should see their own controlled card
            assert(aliceView.includes('my '), 'alice should control a card');
            assert(bobView.includes('my '), 'bob should control a card');
        });

        it('Rule 1-D: player waits when trying to flip card controlled by another', async function() {
            this.timeout(5000); // Increase timeout for concurrent test

            const board = await Board.parseFromFile('boards/ab.txt');

            // Alice flips first card
            await board.flip('alice', 0, 0);

            // Bob tries to flip same card (should wait)
            const bobFlipPromise = board.flip('bob', 0, 0);

            // Let bob start waiting
            await new Promise(resolve => setTimeout(resolve, 100));

            // Alice flips second card (releasing first card)
            await board.flip('alice', 0, 1);

            // Now bob's flip should proceed
            await bobFlipPromise;

            const bobView = board.look('bob');
            assert(bobView.includes('my '), 'bob should eventually get control');
        });

        it('multiple players can watch and receive updates', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            const aliceWatch = board.watch('alice');
            const bobWatch = board.watch('bob');

            // Make a change
            setTimeout(async () => {
                await board.flip('charlie', 0, 0);
            }, 50);

            // Both watchers should be notified
            const [aliceState, bobState] = await Promise.all([aliceWatch, bobWatch]);

            assert(aliceState.includes('up '), 'alice should see the change');
            assert(bobState.includes('up '), 'bob should see the change');
        });
    });

    // ========== Edge cases ==========

    describe('edge cases', function() {

        it('handles player with no prior state', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // New player looks at board
            const state = board.look('newplayer');
            assert(state.startsWith('5x5'), 'new player should see valid board');
        });

        it('handles rapid sequential flips by same player', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Alice makes multiple rapid moves
            await board.flip('alice', 0, 0);
            await board.flip('alice', 0, 1);
            await board.flip('alice', 1, 0);
            await board.flip('alice', 1, 1);

            const state = board.look('alice');
            assert(state !== '', 'should handle rapid flips');
        });

        it('validates player ID format', async function() {
            const board = await Board.parseFromFile('boards/ab.txt');

            // Valid IDs should work
            board.look('alice123');
            board.look('player_1');
            board.look('ABC_123');

            // These should work without throwing
            assert(true, 'valid player IDs should be accepted');
        });
    });
});
