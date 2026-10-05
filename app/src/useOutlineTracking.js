import { useEffect } from 'react';
import { headings } from './model';

export const outlineOffset = scroller => Math.min(96, scroller.clientHeight * .2);

export function outlineTargets(root, mode, body) {
  const items = headings(body);
  if (mode === 'edit') {
    const blocks = [...new Set([...root.querySelectorAll('.vditor-sv [data-type="heading-marker"]')]
      .filter(el => el.textContent.includes('#'))
      .map(el => el.closest('[data-block]') || el.parentElement))];
    return blocks.map((element, index) => ({ element, anchor:items[index]?.anchor })).filter(item => item.anchor);
  }
  return [...root.querySelectorAll('.vditor-preview h1,.vditor-preview h2,.vditor-preview h3,.vditor-preview h4,.vditor-preview h5,.vditor-preview h6')]
    .map(element => ({ element, anchor:element.dataset.noteAnchor })).filter(item => item.anchor);
}

export default function useOutlineTracking(host, mode, live, pinnedHeading) {
  useEffect(() => {
    const root = host.current, scroller = root?.closest('.document-scroll');
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const targets = outlineTargets(root, mode, live.current.body).filter(({element}) => element.getClientRects().length);
      if (!targets.length) { live.current.onActiveHeadingChange?.(''); return; }
      if (pinnedHeading.current && targets.some(item => item.anchor === pinnedHeading.current)) {
        live.current.onActiveHeadingChange?.(pinnedHeading.current);
        return;
      }
      const line = scroller.getBoundingClientRect().top + outlineOffset(scroller) + 2;
      let active = targets[0];
      for (const item of targets) {
        if (item.element.getBoundingClientRect().top > line) break;
        active = item;
      }
      if (scroller.scrollHeight > scroller.clientHeight + 4 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 3) active = targets.at(-1);
      live.current.onActiveHeadingChange?.(active.anchor);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const release = () => { pinnedHeading.current = ''; schedule(); };
    const key = event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) release(); };
    scroller.addEventListener('scroll', schedule, {passive:true});
    scroller.addEventListener('wheel', release, {passive:true});
    scroller.addEventListener('touchstart', release, {passive:true});
    scroller.addEventListener('pointerdown', release, {passive:true});
    scroller.addEventListener('keydown', key);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, {subtree:true,childList:true,characterData:true});
    const sizes = new ResizeObserver(schedule);
    sizes.observe(root); sizes.observe(scroller);
    schedule();
    return () => {
      cancelAnimationFrame(frame); mutations.disconnect(); sizes.disconnect();
      scroller.removeEventListener('scroll', schedule);
      scroller.removeEventListener('wheel', release);
      scroller.removeEventListener('touchstart', release);
      scroller.removeEventListener('pointerdown', release);
      scroller.removeEventListener('keydown', key);
    };
  }, [mode]);
}
