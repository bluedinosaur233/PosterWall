// A rounded, symmetric heart described only for choosing image positions.
// These curves never become a canvas path or clip an image.
const curves = [
  [[.5, .18], [.43, .06], [.36, 0], [.25, 0]],
  [[.25, 0], [.10, 0], [0, .10], [0, .28]],
  [[0, .28], [0, .55], [.25, .81], [.5, 1]],
  [[.5, 1], [.75, .81], [1, .55], [1, .28]],
  [[1, .28], [1, .10], [.90, 0], [.75, 0]],
  [[.75, 0], [.64, 0], [.57, .06], [.5, .18]],
];
const outline = curves.flatMap(([p, a, b, q]) => Array.from({length:64}, (_,i) => {
  const t=i/64, u=1-t;
  return [0,1].map(axis => u**3*p[axis]+3*u*u*t*a[axis]+3*u*t*t*b[axis]+t**3*q[axis]);
}));
export function heartSpans(y) {
  const intersections=[];
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)) intersections.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));
  }
  intersections.sort((a,b)=>a-b);
  const spans=[];
  for(let i=0;i<intersections.length-1;i+=2)spans.push([intersections[i],intersections[i+1]]);
  return spans;
}
