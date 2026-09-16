/* =========================================================================
   FRONT — bot testowy do balansu. Rozgrywa N partii w przeglądarce bez okna
   i wypisuje raport końca każdej (doktryna, warianty, fala, czas, bastion).

   Uruchomienie (z katalogu repo):
     python3 -m http.server 8123 &
     npm i playwright            # raz; przeglądarkę wskazuje EXE albo Playwright pobiera sam
     RUNS=4 SPEED=10 STYL=natarcie node tools/bot-test.js

   Zmienne: RUNS (partie, domyślnie 4), SPEED (podkroki symulacji na klatkę, 10),
   MAXREAL (limit sekund realnych na partię, 240), STYL (obrona | natarcie),
   TRACE=1 (wypisz skład bazy wroga w falach 1–8),
   EXE (ścieżka do Chromium, gdy Playwright nie ma własnej), URL (domyślnie
   http://localhost:8123/?debug — parametr ?debug jest wymagany).

   Bot jest prosty: stawia budynki z listy, bierze karty armii, przestawia
   linię wg stosunku sił. Nie kituje, nie naprawia, nie rozbiera. Mierzy
   dolną granicę tego, co da się w grze osiągnąć, nie grę człowieka.
   ========================================================================= */
const { chromium } = require('playwright');
const RUNS = +(process.env.RUNS || 4), SPEED = +(process.env.SPEED || 10);
const MAXREAL = +(process.env.MAXREAL || 240), STYL = process.env.STYL || 'obrona';
const URL = process.env.URL || 'http://localhost:8123/?debug';
// MISJA=m4 → bot gra misję kampanii (ta sama ramka co gra dowolna, inne dane).
// Bez tej zmiennej gra jak dotąd: gra dowolna z wariantami i eskalacją.
const MISJA = process.env.MISJA || '';
const TRACE = !!process.env.TRACE;   // TRACE=1: skład bazy wroga w falach 1–8

(async () => {
  const launch = { headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.EXE) launch.executablePath = process.env.EXE;
  const browser = await chromium.launch(launch);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // start: misja kampanii albo gra dowolna (menu startowe trzeba przeklikać)
  await page.evaluate(m => window.__front.startMission(m || 'skirmish'), MISJA);
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = document.querySelector('[data-act=\"go\"]');
    if (g && !document.getElementById('menu').classList.contains('hidden')) g.click(); });
  await page.waitForTimeout(200);

  await page.evaluate(async ({ SPEED, STYL }) => {
    const b = await import('/src/buildings.js'), e = await import('/src/economy.js');
    const { S } = await import('/src/state.js'), { ROWS, COLS, B } = await import('/src/config.js');
    const sim = await import('/src/sim.js'), en = await import('/src/enemy.js'), cards = await import('/src/cards.js');
    window.__gt = 0; window.__lastTimer = null; window.__trace = []; window.__lastWave = -1;
    const count = t => S.buildings.filter(x => x.type === t).length;
    function place(t){
      if (S.money < B[t].cost) return false;
      let best = null, bv = -1e9;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++){
        if (!b.fits(t, c, r)) continue;
        const n = t === 'refinery' ? e.oreAround(t, c, r).n : 0;
        if (t === 'refinery' && n === 0) continue;
        const v = n * 100 - (Math.abs(c - S.hq.c) + Math.abs(r - S.hq.r));
        if (v > bv){ bv = v; best = [c, r]; }
      }
      if (!best) return false;
      S.money -= B[t].cost; b.mkBuilding(t, best[0], best[1]); b.recalcPower(); return true;
    }
    function upgrade(){
      const c = S.buildings.filter(x => b.canUp(x) && x.type !== 'hq').sort((x, y) => b.upCost(x) - b.upCost(y))[0];
      if (c && S.money >= b.upCost(c) + 150){ S.money -= b.upCost(c); c.lvl++; b.recalcPower(); return; }
      if (S.hq && S.money >= b.upCost(S.hq) + 300 && !b.roomFor('barracks')){ S.money -= b.upCost(S.hq); S.hq.lvl++; }
    }
    window.__botTick = function(){
      if (S.state === 'draft'){ const pick = (S.draft || []).find(c => c.repeat) || (S.draft || [])[S.draft.length - 1]; if (pick) cards.takeCard(pick); return; }
      if (S.state !== 'play') return;
      if (!S.ready){ S.ready = true; S.speed = SPEED; }
      if (S.wave !== window.__lastWave && S.wave >= 1 && S.wave <= 8){
        window.__lastWave = S.wave;
        const c = {}; for (const t of S.eBase) c[t] = (c[t]||0) + 1;
        window.__trace.push('f' + S.wave + ':' + Object.entries(c).map(([k,v]) => k + '×' + v).join(' '));
      }
      if (window.__lastTimer != null && S.timer < window.__lastTimer) window.__gt += window.__lastTimer - S.timer;
      window.__lastTimer = S.timer;
      if (S.supply < S.drain + 2 && count('power') < 6) place('power');
      const order = [];
      if (count('refinery') < 2) order.push('refinery');
      if (count('barracks') < 2) order.push('barracks');
      if (count('rocket') < 1) order.push('rocket');
      if (count('radar') < 1 && S.wave >= 2) order.push('radar');
      if (count('workshop') < 1 && S.wave >= 3) order.push('workshop');
      if (count('factory') < 1 && S.wave >= 4) order.push('factory');
      if (count('barracks') < 4) order.push('barracks');
      if (count('rocket') < 2) order.push('rocket');
      if (count('lab') < 1 && S.wave >= 7) order.push('lab');
      if (count('arty') < 1 && S.wave >= 8) order.push('arty');
      if (count('heavy') < 1 && S.wave >= 9) order.push('heavy');
      order.push('bunker');
      for (const t of order){ if (b.unlocked(t) && place(t)) break; }
      upgrade();
      const r = en.eRatio(), bas = S.bastion.hp / S.bastion.maxHp;
      let want = 2;
      if (STYL === 'natarcie'){ if (S.wave < 2) want = 1; if (r < 0.9) want = 3; if (r < 0.6 || bas < 0.5 || S.wave >= 12) want = 4; if (r > 1.8) want = 0; }
      else { if (S.wave < 2) want = 1; if (r < 0.6) want = 3; if (r < 0.35 || bas < 0.35) want = 4; if (r > 1.6) want = 0; }
      sim.setStance(want);
    };
  }, { SPEED, STYL });

  for (let run = 1; run <= RUNS; run++){
    const t0 = Date.now(); let done = false;
    while (!done && Date.now() - t0 < MAXREAL * 1000){
      const st = await page.evaluate(() => { window.__botTick(); return window.__front.state(); });
      if (st === 'win' || st === 'over') done = true; else await page.waitForTimeout(250);
    }
    const rep = await page.evaluate(async () => {
      const { S } = await import('/src/state.js'); const m = window.__front.meta(); const h = m.history[m.history.length - 1];
      return { state: S.state, gt: Math.round(window.__gt), wave: S.wave, h, trace: window.__trace.join(' | ') };
    });
    if (TRACE) console.log('  baza wroga:', rep.trace);
    const h = rep.h || {};
    console.log(`PARTIA ${run} (${STYL}): ${rep.state === 'win' ? 'ZWYCIĘSTWO' : rep.state === 'over' ? 'porażka' : 'limit czasu'} · fala ${rep.wave} · czas gry ~${Math.round(rep.gt / 60)} min · real ${Math.round((Date.now() - t0) / 1000)} s · ${h.doctrine || '?'} · ${(h.mods || []).join('+') || '—'} · bastion ${h.bastionDestroyedPct ?? '?'}% · zabici wróg/Twoi ${h.enemyKilled ?? '?'}/${h.playerKilled ?? '?'} · budynki ${h.buildingsBuiltTotal ?? '?'} · szczyt wroga ${h.peakEnemyOnField ?? '?'}` +
      (h.income ? ` · dochód ${h.incomeTotal} (ruda ${h.income.ruda} / sektory ${h.income.sektory} / baza ${h.income.baza} / łupy ${h.income.lupy} / złom ${h.income.zlom} / karty ${h.income.karty}) · wydane ${h.spent} · w kasie ${h.money}` : ''));
    await page.evaluate(m => {
      window.__gt = 0; window.__lastTimer = null; window.__trace = []; window.__lastWave = -1;
      if (m) window.__front.startMission(m); else window.__front.newRun();
      const g = document.querySelector('[data-act="go"]');
      if (g && !document.getElementById('menu').classList.contains('hidden')) g.click();
    }, MISJA);
    await page.waitForTimeout(300);
  }
  if (errors.length) console.log('BŁĘDY JS:', errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
