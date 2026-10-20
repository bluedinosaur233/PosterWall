// Original geometric cover designs shared by the web demo and documentation.
// A canvas factory keeps this generator usable in both browsers and Node.js.
export function createDemoProject(makeCanvas) {
  const palettes = [
    ['#eee5d5', '#dd593b', '#202d3a'], ['#243d48', '#e9b95f', '#f1e6d3'],
    ['#c5d1bf', '#31554a', '#f4efe3'], ['#e4b2a0', '#843b37', '#f4e8cd'],
    ['#ece9df', '#424b78', '#df805c'], ['#d8a64c', '#242f36', '#f3dfb9'],
    ['#2f3544', '#a9b6a4', '#e8dccc'], ['#e5ddd1', '#845b46', '#394a48'],
  ];
  const names = ['ORBIT', 'TIDE', 'ECHO', 'FORM', 'RHYTHM', 'ARC'];
  const images = Array.from({ length: 48 }, (_, index) => {
    const canvas = makeCanvas(400, 600), ctx = canvas.getContext('2d');
    const [paper, ink, accent] = palettes[index % palettes.length];
    const pattern = Math.floor(index / palettes.length), offset = index % 4 * 12;
    ctx.fillStyle = paper; ctx.fillRect(0, 0, 400, 600);
    ctx.save(); ctx.beginPath(); ctx.rect(24, 105, 352, 365); ctx.clip();
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = 18;
    if (pattern === 0) {
      ctx.beginPath(); ctx.arc(200, 270, 136, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(220 + offset, 230, 72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = paper; ctx.fillRect(24, 305, 352, 14); ctx.fillRect(24, 337, 352, 8);
    } else if (pattern === 1) {
      for (let row = 0; row < 7; row++) {
        ctx.beginPath(); ctx.moveTo(-10, 150 + row * 44);
        ctx.bezierCurveTo(120, 40 + row * 44 + offset, 260, 265 + row * 44, 410, 155 + row * 44); ctx.stroke();
      }
    } else if (pattern === 2) {
      for (let ring = 0; ring < 7; ring++) {
        ctx.strokeStyle = ring % 2 ? accent : ink;
        ctx.beginPath(); ctx.arc(200, 300, 150 - ring * 22, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (pattern === 3) {
      for (let row = 0; row < 4; row++) for (let column = 0; column < 3; column++) {
        ctx.fillStyle = (row + column + index) % 3 ? ink : accent;
        ctx.fillRect(52 + column * 104, 130 + row * 82, 78, 62);
      }
    } else if (pattern === 4) {
      ctx.translate(200, 290); ctx.rotate(-Math.PI / 5);
      for (let strip = -4; strip <= 4; strip++) {
        ctx.fillStyle = strip % 2 ? ink : accent; ctx.fillRect(strip * 58, -230, 34, 460);
      }
    } else {
      for (let arch = 0; arch < 5; arch++) {
        ctx.strokeStyle = arch % 2 ? accent : ink;
        ctx.beginPath(); ctx.arc(200, 300, 150 - arch * 30, Math.PI, 0);
        ctx.lineTo(350 - arch * 30, 480); ctx.stroke();
      }
    }
    ctx.restore(); ctx.fillStyle = ink;
    ctx.font = '500 15px sans-serif'; ctx.fillText(`STUDY ${String(index + 1).padStart(2, '0')}`, 30, 53);
    ctx.font = 'bold 44px sans-serif'; ctx.fillText(names[pattern], 28, 535);
    ctx.fillRect(30, 561, 340, 2);
    return { id: `study-${index + 1}`, title: `${names[pattern]} ${index + 1}`, src: canvas.toDataURL('image/png') };
  });
  return {
    version: 1,
    settings: { ratio: 'portrait', padding: 48, seed: 233 },
    subject: { shape: 'square', tileRatio: 'portrait', granularity: 4, count: 48, scale: .84 },
    base: { preset: 'white' }, images,
  };
}
