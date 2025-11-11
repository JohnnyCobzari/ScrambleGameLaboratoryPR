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
    const filename = 'boards/ab.txt'; // 5x5 board
    const board: Board = await Board.parseFromFile(filename);
    const size = 5; // 5x5 board
    const players = 4; // 4 players
    const tries = 100; // 100 moves each
    const minDelayMilliseconds = 0.1; // Minimum delay
    const maxDelayMilliseconds = 2; // Maximum delay
    const ten = 10;
    const hundread = 100;

    console.log('=== INITIAL BOARD STATE ===');
    console.log(board.toString());
    console.log('===========================\n');

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii));
    }

    console.log(`\nStarting simulation with ${players} players, ${tries} moves each...`);
    const startTime = Date.now();

    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);

    const duration = Date.now() - startTime;

    console.log('\n=== FINAL BOARD STATE ===');
    console.log(board.toString());
    console.log('=========================');
    console.log(`\n✅ SIMULATION COMPLETED SUCCESSFULLY!`);
    console.log(`   Total time: ${duration}ms`);
    console.log(`   Total moves: ${players * tries}`);
    console.log(`   No crashes detected!`);

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number): Promise<void> {
        // Set up player ID
        const playerId = `player${playerNumber}`;
        console.log(`${playerId} starting simulation...`);

        for (let jj = 0; jj < tries; ++jj) {
            try {
                // Random delay between minDelay and maxDelay
                await timeout(minDelayMilliseconds + Math.random() * (maxDelayMilliseconds - minDelayMilliseconds));

                // Try to flip over a first card at random position
                const row1 = randomInt(size);
                const col1 = randomInt(size);
                console.log(`${playerId} attempt ${jj + 1}: flipping first card at (${row1}, ${col1})`);
                await board.flipCard(playerId, row1, col1);
                console.log(`${playerId} successfully flipped first card at (${row1}, ${col1})`);

                // Random delay between minDelay and maxDelay
                await timeout(minDelayMilliseconds + Math.random() * (maxDelayMilliseconds - minDelayMilliseconds));

                // Try to flip over a second card at random position
                const row2 = randomInt(size);
                const col2 = randomInt(size);
                console.log(`${playerId} flipping second card at (${row2}, ${col2})`);
                await board.flipCard(playerId, row2, col2);
                console.log(`${playerId} successfully flipped second card at (${row2}, ${col2})`);

                // Only show board state every 10 moves to reduce console spam
                if ((jj + 1) % ten === 0) {
                    console.log(`\n${playerId} completed ${jj + 1} moves`);
                }
            } catch (err) {
                console.error(`${playerId} attempt ${jj + 1} failed:`, String(err).substring(0, hundread));
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