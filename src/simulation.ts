/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import { Board } from './board.js';

/**
 * Example code for simulating a game.
 *
 * PS4 instructions: you may use, modify, or remove this file,
 *   completing it is recommended but not required.
 *
 * @throws Error if an error occurs reading or parsing the board
 */
async function simulationMain(): Promise<void> {
    const filename = 'boards/perfect.txt'; // Use smaller 3x3 board for easier visualization
    const board: Board = await Board.parseFromFile(filename);
    const size = 3; // 3x3 board
    const players = 2; // 2 players for easier visualization
    const tries = 5; // Fewer tries for cleaner output
    const maxDelayMilliseconds = 200; // Slower for better visualization

    console.log('=== INITIAL BOARD STATE ===');
    console.log(board.toString());
    console.log('===========================\n');

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii));
    }
    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);

    console.log('\n=== FINAL BOARD STATE ===');
    console.log(board.toString());
    console.log('=========================');

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number): Promise<void> {
        // Set up player ID
        const playerId = `player${playerNumber}`;
        console.log(`${playerId} starting simulation...`);

        for (let jj = 0; jj < tries; ++jj) {
            try {
                // Random delay before first card
                await timeout(Math.random() * maxDelayMilliseconds);

                // Try to flip over a first card at random position
                const row1 = randomInt(size);
                const col1 = randomInt(size);
                console.log(`${playerId} attempt ${jj + 1}: flipping first card at (${row1}, ${col1})`);
                await board.flipCard(playerId, row1, col1);
                console.log(`${playerId} successfully flipped first card at (${row1}, ${col1})`);

                // Random delay before second card
                await timeout(Math.random() * maxDelayMilliseconds);

                // Try to flip over a second card at random position
                const row2 = randomInt(size);
                const col2 = randomInt(size);
                console.log(`${playerId} flipping second card at (${row2}, ${col2})`);
                await board.flipCard(playerId, row2, col2);
                console.log(`${playerId} successfully flipped second card at (${row2}, ${col2})`);

                // Show board state from this player's perspective
                console.log(`\n${playerId}'s view of the board:`);
                console.log(board.getBoardState(playerId));
            } catch (err) {
                console.error(`${playerId} attempt to flip a card failed:`, err);
            }
        }

        console.log(`${playerId} finished simulation`);
    }
}

/**
 * Random positive integer generator
 *
 * @param max a positive integer which is the upper bound of the generated number
 * @returns a random integer >= 0 and < max
 */
function randomInt(max: number): number {
    return Math.floor(Math.random() * max);
}


/**
 * @param milliseconds duration to wait
 * @returns a promise that fulfills no less than `milliseconds` after timeout() was called
 */
async function timeout(milliseconds: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, milliseconds);
    return promise;
}

void simulationMain();