(function (root) {
  'use strict';
  // Both games, their intro and collection cover use these same GPT image assets.
  const script = document.currentScript;
  const base = script && script.src ? new URL('garden-art/', script.src).href : '../shared/garden-art/';
  const images = {}, listeners = [];
  let pending = 3, settled = false;
  const rects = {
    birdUp:[106,112,334,313], birdDown:[603,140,339,290],
    frog:[1099,158,349,320], frogJump:[68,603,433,321],
    fish:[615,617,333,282], dragonfly:[1128,621,346,291],
  };
  function finish() { if (--pending === 0) { settled = true; listeners.splice(0).forEach(fn => fn()); } }
  if (typeof Image === 'function') {
    [['characters','characters.png'],['meadow','meadow.png'],['pond','pond.png']].forEach(([key,file]) => {
      const image = images[key] = new Image(); image.onload = finish; image.onerror = finish; image.src = base + file;
    });
  } else { pending = 0; settled = true; }
  function available(key) { return !!(images[key] && images[key].complete && images[key].naturalWidth); }
  function sprite(ctx, name, x, y, w, h) {
    const r = rects[name]; if (!r || !available('characters')) return false;
    const scale = Math.min(w/r[2], h/r[3]), dw = r[2]*scale, dh = r[3]*scale;
    ctx.drawImage(images.characters, ...r, x+(w-dw)/2, y+h-dh, dw, dh); return true;
  }
  function background(ctx, name, w, h, worldX, groundY, unit) {
    if (!available(name)) return false;
    const image = images[name], split = name === 'meadow' ? .82 : .65;
    const horizon = name === 'meadow' ? groundY : Math.max(h*.42, groundY-82*(unit||1));
    const top = image.naturalHeight*split, tileW = Math.max(w*1.4, horizon*image.naturalWidth/top);
    const travel = (worldX||0)*.12, first = Math.floor(travel/tileW), offset = travel%tileW;
    for (let i=0; i<3; i++) {
      const x = i*tileW-offset;
      ctx.save();ctx.translate(x,0);
      if ((first+i)%2) { ctx.translate(tileW,0);ctx.scale(-1,1); }
      ctx.drawImage(image,0,0,image.naturalWidth,top,0,0,tileW,horizon);
      ctx.drawImage(image,0,top,image.naturalWidth,image.naturalHeight-top,0,horizon,tileW,h-horizon);
      ctx.restore();
    }
    return true;
  }
  root.RugeGardenArt = {sprite,background,available,whenReady(fn){if(settled)fn();else listeners.push(fn);}};
})(window);
