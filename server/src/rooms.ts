import { nanoid } from 'nanoid';
import { Game } from './game/GameState.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

export class Rooms {
  private games = new Map<string, Game>();

  create(): Game {
    let code = '';
    do { code = Array.from({ length: 4 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    } while (this.games.has(code));
    const g = new Game(code);
    this.games.set(code, g);
    return g;
  }
  get(code: string): Game | undefined { return this.games.get(code?.toUpperCase()); }
  delete(code: string) { this.games.delete(code); }
}
