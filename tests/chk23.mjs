import { chromium } from 'playwright';
// CI-ready: BASE_URL and PW_EXECUTABLE come from env; defaults match local dev.
const __B = process.env.BASE_URL || 'http://127.0.0.1:8899/';

const b = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
const U = __B + 'index.html';
const p = await b.newPage({ viewport:{width:1400,height:900} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(U,{waitUntil:'domcontentloaded'});
await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
await p.goto(U,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2200);
const out={};
out.groupHeadings = await p.$$eval('.fgrouphd', e=>e.map(x=>x.textContent.trim()));
out.picksInOwnGroup = await p.evaluate(()=>{
  const g=document.getElementById('picksRow').closest('.fgroup');
  return g ? g.querySelector('.fgrouphd').textContent.trim() : 'not in a group';
});
await p.evaluate(()=>{ state.showAllGenres=true; buildTagRow(); });
await p.waitForTimeout(250);
out.rareChips = await p.evaluate(()=>{
  const want=['legacy','roleplaying','survival','storytelling','superhero'];
  const shown=[...document.querySelectorAll('#genreRow .wt')].map(x=>x.textContent.trim().toLowerCase());
  return want.map(w=>({tag:w, shown: shown.some(s=>s.startsWith(w))}));
});
out.chipTotal = await p.evaluate(()=>document.querySelectorAll('#genreRow .wt').length);
out.tableFeeGone = await p.evaluate(()=>!/table fee/i.test(document.querySelector('footer').textContent));
out.footerText = await p.evaluate(()=>document.querySelector('footer').textContent.replace(/\s+/g,' ').trim().slice(0,220));
// a rare chip must still filter correctly
out.rareWorks = await p.evaluate(()=>{
  state.tags['legacy']=1; state.limit=9999; render();
  const n=document.querySelectorAll('#list .gname h3').length;
  delete state.tags['legacy']; render();
  return n;
});
out.errors=errs;
await p.close(); await b.close();
console.log(JSON.stringify(out,null,1));
