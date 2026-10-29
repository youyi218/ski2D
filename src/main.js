// Entry: ?resort=… opens that mountain; otherwise the landing page lets you pick one.
import { chosenResort } from './resorts.js';
import './style.css';

if (chosenResort()) await import('./game.js');
else await import('./landing.js');
