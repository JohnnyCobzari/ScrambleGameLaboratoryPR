Lab 3: Multiplayer Game
For this lab you will implement the MIT 6.102 (2025) Memory Scramble lab.(https://web.mit.edu/6.102/www/sp25/psets/ps4)
You can find the starter code that they provide to the students in this Github repo.
You are free to use any HTTP and unit test libraries.
Structure of your implementation
The provided skeleton (in TypeScript) already implements the web API server, your job remains to implement the Board ADT and complete the functions in “commands.ts” by calling your Board’s methods.
You may use any language you want. However, you must still follow the structure imposed in the requirements and in the skeleton. Basically, you should convert the provided skeleton to your language of choice and go from there. More explicitly, you must retain the following structure:
A mutable Board ADT with defined rep invariants and a checkRep() function
A “commands” module implementing the given specification(https://web.mit.edu/6.102/www/sp25/psets/ps4/doc/modules/commands.html)
An HTTP API that only calls the functions from the “commands” module (it can’t call the Board’s methods directly)
Grading
Implementation:
(10 points) The game works correctly according to all the rules
(10 points) You have unit tests for the Board ADT covering all the rules, the tests are readable and documented (and passing)
(4 points) You have a script that simulates multiple players making random moves with random timeouts. The goal is to check that the game never crashes (and it doesn’t)
Design and documentation:
(6 points) You followed the required structure of the modules (especially the “commands” module)
(6 points) Representation invariants, safety from rep exposure arguments, for every ADT(https://web.mit.edu/6.102/www/sp25/classes/07-abstraction-functions-rep-invariants/)
(8 points) Specifications for every method (function signature, preconditions, postconditions)(https://web.mit.edu/6.102/www/sp25/classes/04-specifications/)