'use client';
import { useEffect, useRef } from 'react';

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
const FRAG = `precision highp float;
uniform float t;uniform vec2 r;uniform vec2 m;
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-r)/min(r.x,r.y);
  for(float i=1.0;i<10.0;i++){
    uv.x+=0.32/i*cos(i*2.6*uv.y+t+m.x*3.14159);
    uv.y+=0.32/i*cos(i*2.6*uv.x+t+m.y*3.14159);
  }
  vec3 base=vec3(0.115,0.078,0.022);
  vec3 c=base/abs(sin(t-uv.y-uv.x));
  c=1.0-exp(-c*1.25);
  c=pow(c,vec3(1.05,1.12,1.6));
  gl_FragColor=vec4(c,1.0);
}`;

/** Fundo de ouro líquido (WebGL) do login aprovado. Respeita prefers-reduced-motion. */
export function LiquidGold() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const gl = cv?.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!cv || !gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uT = gl.getUniformLocation(pr, 't');
    const uR = gl.getUniformLocation(pr, 'r');
    const uM = gl.getUniformLocation(pr, 'm');

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = Math.max(1, Math.floor(cv.clientWidth * dpr));
      const h = Math.max(1, Math.floor(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uR, w, h);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);

    const mouse = [0, 0];
    const target = [0, 0];
    const onMove = (e: PointerEvent) => {
      target[0] = (e.clientX / window.innerWidth - 0.5) * 0.6;
      target[1] = (e.clientY / window.innerHeight - 0.5) * -0.6;
    };
    window.addEventListener('pointermove', onMove);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      mouse[0]! += (target[0]! - mouse[0]!) * 0.04;
      mouse[1]! += (target[1]! - mouse[1]!) * 0.04;
      gl.uniform1f(uT, reduce ? 2 : ((now - t0) / 1000) * 0.22);
      gl.uniform2f(uM, mouse[0]!, mouse[1]!);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 block h-full w-full animate-[fadein_1.6s_.1s_ease_forwards] opacity-0"
    />
  );
}
