/* Copyright (c) 2021-25 MIT 6.102/6.031 course staff, all rights reserved.
 * Redistribution of original or derived work requires permission of course staff.
 */

import assert from 'node:assert';
import { Board } from './board.js';

/**
 * Example code for simulating a game with multiple concurrent players
 * making random moves to test for race conditions and crashes.
 *
 * PS4 instructions: you may use, modify, or remove this file,
 *   completing it is recommended but not required.
 *
 * @throws Error if an error occurs reading or parsing the board
 */
async function simulationMain(): Promise<void> {
    const filename = 'boards/ab.txt';
    const board: Board = await Board.parseFromFile(filename);
    const size = 5; // 5x5 board
    const players = 5; // Number of concurrent players
    const tries = 20; // Attempts per player
    const maxDelayMilliseconds = 100;

    console.log(`Starting simulation with ${players} players, ${tries} tries each`);
    console.log(`Board: ${filename} (${size}x${size})`);

    // start up one or more players as concurrent asynchronous function calls
    const playerPromises: Array<Promise<void>> = [];
    for (let ii = 0; ii < players; ++ii) {
        playerPromises.push(player(ii));
    }

    // wait for all the players to finish (unless one throws an exception)
    await Promise.all(playerPromises);

    console.log('Simulation completed successfully - no crashes!');

    /** @param playerNumber player to simulate */
    async function player(playerNumber: number): Promise<void> {
        const playerId = `player${playerNumber}`;
        console.log(`${playerId} starting...`);

        let successfulMoves = 0;
        let failedMoves = 0;

        for (let jj = 0; jj < tries; ++jj) {
            try {
                // Random delay before first card
                await timeout(Math.random() * maxDelayMilliseconds);

                // Try to flip a random first card
                const row1 = randomInt(size);
                const col1 = randomInt(size);
                console.log(`${playerId} flipping first card at (${row1}, ${col1})`);
                await board.flip(playerId, row1, col1);

                // Random delay before second card
                await timeout(Math.random() * maxDelayMilliseconds);

                // Try to flip a random second card
                const row2 = randomInt(size);
                const col2 = randomInt(size);
                console.log(`${playerId} flipping second card at (${row2}, ${col2})`);
                await board.flip(playerId, row2, col2);

                successfulMoves++;
            } catch (err) {
                // Expected errors: flipping empty space, same card twice, etc.
                console.log(`${playerId} move failed (expected): ${err}`);
                failedMoves++;
            }
        }

        console.log(`${playerId} finished: ${successfulMoves} successful, ${failedMoves} failed`);
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
