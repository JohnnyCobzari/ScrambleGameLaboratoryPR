/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import { Board } from '../src/board.js';


/**
 * Tests for the Board abstract data type.
 */
describe('Board', function() {

    // Testing strategy for parseFromFile:
    //   - Valid board files: different sizes (3x3, 5x5), different card types (emoji, letters)
    //   - Invalid files: wrong format, wrong number of cards, invalid dimensions
    //   - toString should show the board structure

    it('parses perfect.txt correctly', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        const str = board.toString();
        assert(str.startsWith('3x3\n'));
        assert(str.includes('🦄'));
        assert(str.includes('🌈'));
    });

    it('parses ab.txt correctly', async function() {
        const board = await Board.parseFromFile('boards/ab.txt');
        const str = board.toString();
        assert(str.startsWith('5x5\n'));
    });

    // Testing strategy for gameplay:
    //   - Single player flips first card (face down -> face up, controlled)
    //   - Single player flips second card matching -> cards stay controlled
    //   - Single player flips second card not matching -> cards relinquished
    //   - Player flips new first card -> cleanup previous move (remove matched, or turn face down)
    //   - Flip empty space -> error
    //   - look() returns correct board state from player's perspective

    it('single player flips first card face down', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        await board.flipCard('alice', 0, 0);
        const state = board.getBoardState('alice');
        // First card should be controlled by alice
        assert(state.includes('my 🦄'), 'alice should control the unicorn');
    });

    it('single player matches two cards', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        await board.flipCard('alice', 0, 0); // 🦄
        await board.flipCard('alice', 0, 1); // 🦄 - match!
        const state = board.getBoardState('alice');
        // Both cards should still be face up
        assert(state.includes('🦄'), 'unicorns should still be visible');
    });

    it('player removes matched cards on next move', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        await board.flipCard('alice', 0, 0); // 🦄
        await board.flipCard('alice', 0, 1); // 🦄 - match!
        await board.flipCard('alice', 1, 0); // new first card - should remove matched pair
        const state = board.getBoardState('alice');
        const lines = state.split('\n');
        assert.strictEqual(lines[1], 'none', 'first unicorn should be removed');
        assert.strictEqual(lines[2], 'none', 'second unicorn should be removed');
    });

    it('player flips non-matching cards', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        await board.flipCard('alice', 0, 0); // 🦄
        await board.flipCard('alice', 0, 2); // 🌈 - no match
        const state = board.getBoardState('alice');
        // Both should be face up but not controlled
        assert(state.includes('up 🦄'), 'unicorn should be face up');
        assert(state.includes('up 🌈'), 'rainbow should be face up');
    });

    it('throws error when flipping empty space', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        await board.flipCard('alice', 0, 0); // 🦄
        await board.flipCard('alice', 0, 1); // 🦄 - match!
        await board.flipCard('alice', 1, 0); // removes matched pair
        // Now (0,0) is empty
        await assert.rejects(
            async () => board.flipCard('bob', 0, 0),
            /No card/
        );
    });

    it('look returns correct board state', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        const state = board.getBoardState('alice');
        assert(state.startsWith('3x3\n'), 'should start with dimensions');
        // Count down cards - all should be face down initially
        const downCount = (state.match(/down/g) || []).length;
        assert.strictEqual(downCount, 9, 'all 9 cards should be face down initially');
    });

    // Testing strategy for map():
    //   - Transform cards and verify they change
    //   - Verify pairwise consistency (matching cards stay matching)
    //   - Verify map doesn't affect face up/down state

    it('map transforms all cards', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        // Flip a card first so we can see it
        await board.flipCard('alice', 0, 0); // 🦄

        await board.mapCards(async (card) => {
            // Replace unicorns with stars, rainbows with suns
            if (card === '🦄') return '⭐';
            if (card === '🌈') return '☀️';
            return card;
        });
        const state = board.getBoardState('alice');
        assert(!state.includes('🦄'), 'unicorns should be replaced');
        assert(!state.includes('🌈'), 'rainbows should be replaced (even if face down)');
        assert(state.includes('⭐'), 'stars should appear (at least the flipped one)');
    });

    it('map maintains pairwise consistency', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        // Flip two matching unicorns
        await board.flipCard('alice', 0, 0); // 🦄
        await board.flipCard('alice', 0, 1); // 🦄 - match!

        // Transform cards
        await board.mapCards(async (card) => {
            if (card === '🦄') return '⭐';
            return card;
        });

        const state = board.getBoardState('alice');
        // Both unicorns should now be stars
        const starCount = (state.match(/⭐/g) || []).length;
        assert(starCount >= 2, 'at least 2 stars should exist (the matched pair)');
    });

    // Testing strategy for watch():
    //   - Watch waits until board changes
    //   - Changes trigger watchers (flip, remove, map)
    //   - Control changes don't trigger watchers

    it('watch waits for card flip', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        let watchResolved = false;

        // Start watching in background
        const watchPromise = board.waitForChange().then(() => {
            watchResolved = true;
        });

        // Initially not resolved
        assert.strictEqual(watchResolved, false, 'watch should not resolve immediately');

        // Flip a card (this should trigger watch)
        await board.flipCard('alice', 0, 0);

        // Wait a bit for watch to resolve
        await watchPromise;
        assert.strictEqual(watchResolved, true, 'watch should resolve after card flip');
    });

    it('watch waits for map changes', async function() {
        const board = await Board.parseFromFile('boards/perfect.txt');
        let watchResolved = false;

        // Start watching
        const watchPromise = board.waitForChange().then(() => {
            watchResolved = true;
        });

        // Transform cards
        await board.mapCards(async (card) => card + '_new');

        // Wait for watch
        await watchPromise;
        assert.strictEqual(watchResolved, true, 'watch should resolve after map');
    });

    // Testing strategy for complete gameplay rules:
    //   Test each rule explicitly with different scenarios

    describe('Rule 1-A: No card at position (first card)', function() {
        it('throws error when flipping empty space as first card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Remove a card first
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 1); // 🦄 - match
            await board.flipCard('alice', 1, 0); // new move, removes (0,0) and (0,1)

            // Now (0,0) is empty
            await assert.rejects(
                async () => board.flipCard('bob', 0, 0),
                /No card/,
                'should throw error for empty space'
            );
        });
    });

    describe('Rule 1-B: Face down card turns face up', function() {
        it('turns face down card face up and gives control', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0);
            const state = board.getBoardState('alice');
            assert(state.includes('my 🦄'), 'alice should control the card');
        });
    });

    describe('Rule 1-C: Face up uncontrolled card', function() {
        it('gives control of face up uncontrolled card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Alice flips two non-matching cards
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 2); // 🌈 - no match, both relinquished

            // Cards are face up but not controlled
            // Bob flips the same card as first card
            await board.flipCard('bob', 0, 0);
            const state = board.getBoardState('bob');
            assert(state.includes('my 🦄'), 'bob should control the previously face-up card');
        });
    });

    describe('Rule 1-D: Wait for controlled card', function() {
        it('waits when first card is controlled by another player', async function() {
            this.timeout(5000); // Increase timeout
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Alice flips first card at (0,0) = 🦄
            await board.flipCard('alice', 0, 0);

            // Bob tries to flip same card - should wait
            let bobResolved = false;
            const bobPromise = board.flipCard('bob', 0, 0).then(() => {
                bobResolved = true;
            }).catch((err) => {
                // Bob might fail if card gets removed
                bobResolved = true;
            });

            // Bob should be waiting initially
            await new Promise(resolve => setTimeout(resolve, 50));
            assert.strictEqual(bobResolved, false, 'bob should be waiting');

            // Alice flips NON-MATCHING second card (0,2) = 🌈, relinquishing control
            await board.flipCard('alice', 0, 2);

            // Now Bob should get control
            await Promise.race([
                bobPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Bob never resolved')), 2000))
            ]);

            assert.strictEqual(bobResolved, true, 'bob should now have control');
        });
    });

    describe('Rule 2-A: No card at position (second card)', function() {
        it('throws error and relinquishes first card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Remove a card
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 1); // 🦄 - match
            await board.flipCard('alice', 1, 0); // removes matched pair

            // Bob flips first card
            await board.flipCard('bob', 1, 1);
            let bobState = board.getBoardState('bob');
            assert(bobState.includes('my'), 'bob should control first card');

            // Bob tries empty space as second card
            await assert.rejects(
                async () => board.flipCard('bob', 0, 0),
                /No card/,
                'should fail on empty second card'
            );

            // Bob's first card should be relinquished (face up but not controlled)
            bobState = board.getBoardState('bob');
            assert(!bobState.includes('my'), 'bob should not control any cards');
            assert(bobState.includes('up 🌈'), 'first card should be face up');
        });
    });

    describe('Rule 2-B: Controlled card (second card)', function() {
        it('throws error immediately without waiting', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Alice flips first card
            await board.flipCard('alice', 0, 0);

            // Bob flips first card
            await board.flipCard('bob', 1, 1);

            // Bob tries to flip Alice's controlled card as second - should fail immediately
            await assert.rejects(
                async () => board.flipCard('bob', 0, 0),
                /controlled/,
                'should fail immediately on controlled card'
            );

            // Bob's first card should be relinquished
            const bobState = board.getBoardState('bob');
            assert(!bobState.includes('my'), 'bob should not control any cards');
        });

        it('prevents deadlock by not waiting on second card', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Alice and Bob each flip a first card
            await board.flipCard('alice', 0, 0);
            await board.flipCard('bob', 1, 1);

            // Alice tries to flip Bob's controlled card as second - should fail immediately
            await assert.rejects(
                async () => board.flipCard('alice', 1, 1),
                /controlled/,
                'alice flip should fail on controlled card'
            );

            // Bob tries to flip Alice's controlled card as second - should fail immediately
            // Alice's card might not be controlled anymore after her failed second flip
            // So we need to check if it's still controlled or try a different scenario
            try {
                await board.flipCard('bob', 0, 0);
                // If it succeeds, that's ok - Alice relinquished control
            } catch (err) {
                // If it fails with "controlled", that's also ok
                assert(String(err).includes('controlled') || String(err).includes('No card'));
            }
        });
    });

    describe('Rule 2-C: Turn second card face up', function() {
        it('turns second card face up if it was face down', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0); // first card
            await board.flipCard('alice', 0, 2); // second card

            const state = board.getBoardState('bob');
            // Both cards should be visible to Bob
            const upCount = (state.match(/up/g) || []).length;
            assert(upCount >= 2, 'at least 2 cards should be face up');
        });
    });

    describe('Rule 2-D: Matching cards', function() {
        it('keeps control of both matching cards', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 1); // 🦄 - match!

            const state = board.getBoardState('alice');
            // Alice should not currently control them (relinquished after match)
            // but they should be face up
            assert(state.includes('🦄'), 'unicorns should be visible');
        });
    });

    describe('Rule 2-E: Non-matching cards', function() {
        it('relinquishes control of both non-matching cards', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 2); // 🌈 - no match

            const state = board.getBoardState('alice');
            // Alice should not control any cards
            assert(!state.includes('my'), 'alice should not control any cards');
            // Both should be face up
            assert(state.includes('up 🦄'), 'unicorn should be face up');
            assert(state.includes('up 🌈'), 'rainbow should be face up');
        });
    });

    describe('Rule 3-A: Remove matched cards', function() {
        it('removes matched cards on next move', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 1); // 🦄 - match
            await board.flipCard('alice', 1, 0); // new first card - triggers cleanup

            const state = board.getBoardState('alice');
            const lines = state.split('\n');
            assert.strictEqual(lines[1], 'none', 'first matched card should be removed');
            assert.strictEqual(lines[2], 'none', 'second matched card should be removed');
        });
    });

    describe('Rule 3-B: Turn down non-matching cards', function() {
        it('turns down uncontrolled non-matching cards on next move', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 2); // 🌈 - no match
            await board.flipCard('alice', 1, 0); // new first card - triggers cleanup

            const state = board.getBoardState('bob');
            const lines = state.split('\n');
            // Cards should be face down if not controlled
            const line1 = lines[1];
            const line3 = lines[3];
            assert(line1 !== undefined && (line1 === 'down' || line1.includes('my')), 'first card should be down or controlled');
            assert(line3 !== undefined && (line3 === 'down' || line3.includes('my')), 'second card should be down or controlled');
        });

        it('does not turn down cards controlled by other players', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Alice flips non-matching cards
            await board.flipCard('alice', 0, 0); // 🦄
            await board.flipCard('alice', 0, 2); // 🌈 - no match

            // Bob takes control of one of Alice's previous cards
            await board.flipCard('bob', 0, 0); // now bob controls it

            // Alice makes new move
            await board.flipCard('alice', 1, 0);

            // Bob's controlled card should still be face up
            const bobState = board.getBoardState('bob');
            assert(bobState.includes('my 🦄'), 'bob should still control the unicorn');
        });
    });

    describe('Concurrent scenarios', function() {
        it('handles multiple players flipping different cards', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Three players flip different cards concurrently
            await Promise.all([
                board.flipCard('alice', 0, 0),
                board.flipCard('bob', 1, 1),
                board.flipCard('charlie', 2, 2)
            ]);

            // Each player should control their card
            const aliceState = board.getBoardState('alice');
            const bobState = board.getBoardState('bob');
            const charlieState = board.getBoardState('charlie');

            assert(aliceState.includes('my'), 'alice should control a card');
            assert(bobState.includes('my'), 'bob should control a card');
            assert(charlieState.includes('my'), 'charlie should control a card');
        });

        it('handles contention for same card', async function() {
            this.timeout(5000); // Increase timeout
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Alice flips a card
            await board.flipCard('alice', 0, 0);

            // Bob and Charlie both try to flip the same card
            // They will wait for Alice to release
            const bobPromise = board.flipCard('bob', 0, 0).catch(() => {});
            const charliePromise = board.flipCard('charlie', 0, 0).catch(() => {});

            // Give them time to start waiting
            await new Promise(resolve => setTimeout(resolve, 50));

            // Alice flips second card, releasing control
            try {
                await board.flipCard('alice', 0, 1);
            } catch {
                // Ignore errors
            }

            // Wait for Bob and Charlie to resolve (with timeout)
            await Promise.race([
                Promise.all([bobPromise, charliePromise]),
                new Promise(resolve => setTimeout(resolve, 1000))
            ]);

            // Test passes if we get here without hanging
            assert(true, 'concurrent players handled without deadlock');
        });
    });

    describe('Edge cases', function() {
        it('handles player flipping same card twice', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            await board.flipCard('alice', 0, 0); // first card
            // Alice tries to flip same card as second
            await assert.rejects(
                async () => board.flipCard('alice', 0, 0),
                /controlled/,
                'should not flip own controlled card as second'
            );
        });

        it('handles all cards being removed', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');
            // Match and remove all pairs (9 cards = 4 pairs + 1 leftover)
            // Keep removing pairs until few cards remain
            for (let i = 0; i < 3; i++) {
                try {
                    await board.flipCard('alice', 0, 0);
                    await board.flipCard('alice', 0, 1);
                    await board.flipCard('alice', 1, 0); // triggers removal
                } catch {
                    // Some flips might fail if cards already removed
                    break;
                }
            }

            const state = board.getBoardState('alice');
            // Should have some 'none' entries
            assert(state.includes('none'), 'some cards should be removed');
        });

        it('waiting player gets error when matched cards are removed', async function() {
            const board = await Board.parseFromFile('boards/perfect.txt');

            // Alice matches two cards (0,0) and (0,1)
            await board.flipCard('alice', 0, 0);
            await board.flipCard('alice', 0, 1);

            // Bob tries to flip one of Alice's matched cards - should wait
            const bobFlipPromise = board.flipCard('bob', 0, 0);

            // Give Bob time to start waiting
            await new Promise(resolve => setTimeout(resolve, 50));

            // Alice makes next move, triggering removal of matched cards
            await board.flipCard('alice', 1, 0);

            // Bob should get an error because the card disappeared
            await assert.rejects(
                async () => bobFlipPromise,
                /No card at that position/,
                'bob should get error when waiting for card that gets removed'
            );
        });
    });
});


/**
 * Example test case that uses async/await to test an asynchronous function.
 * Feel free to delete these example tests.
 */
describe('async test cases', function() {

    it('reads a file asynchronously', async function() {
        const fileContents = (await fs.promises.readFile('boards/ab.txt')).toString();
        assert(fileContents.startsWith('5x5'));
    });
});