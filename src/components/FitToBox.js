// FitToBox: scales its child uniformly to fill the parent box (#84 workspace stage).
// The world/town/site displays render at fixed tile sizes; rather than re-deriving each
// one's tile math, measure the natural size and apply a transform scale. Transforms keep
// click targets correct and leave the child's own layout (labels, markers) untouched.

import React, { useLayoutEffect, useRef, useState } from 'react';

const FitToBox = ({ children, min = 0.5, max = 2.5, padding = 16 }) => {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, w: 0, h: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    const measure = () => {
      // offsetWidth/Height ignore transforms, so this is the natural (unscaled) size.
      const w = inner.offsetWidth;
      const h = inner.offsetHeight;
      if (!w || !h) return;
      const availW = Math.max(0, outer.clientWidth - padding * 2);
      const availH = Math.max(0, outer.clientHeight - padding * 2);
      const scale = Math.min(max, Math.max(min, Math.min(availW / w, availH / h)));
      setFit((f) => (Math.abs(f.scale - scale) < 0.005 && f.w === w && f.h === h ? f : { scale, w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [min, max, padding]);

  return (
    <div ref={outerRef} className="fit-box" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto', display: 'grid', placeItems: 'center' }}>
      {/* The sizer reserves the SCALED footprint so centering and scrolling see the real size. */}
      <div style={{ width: fit.w * fit.scale || undefined, height: fit.h * fit.scale || undefined, position: 'relative' }}>
        <div ref={innerRef} style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default FitToBox;
