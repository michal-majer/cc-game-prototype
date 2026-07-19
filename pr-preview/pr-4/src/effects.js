/* =========================================================================
   FRONT — efekty cząsteczkowe (wybuchy). Osobny moduł, bo używają go
   niemal wszystkie pozostałe (walka, karty, budynki) — trzyma cykle importów
   płaskie.
   ========================================================================= */

import { S } from './state.js';

export function explode(x, y, n, col){
  for (let i=0;i<n;i++){
    const a=Math.random()*6.283, s=20+Math.random()*90;
    S.fx.push({ x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s,
                life:0.2+Math.random()*0.4, c:col, r:1+Math.random()*2.2 });
  }
}
