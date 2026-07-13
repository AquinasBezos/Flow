// 2D Potential Flow Simulator - Core Application Module
// Physics Engine, Marching Squares Contour Generator, Canvas Interactions, and UI Binding

// --- Google Fonts loading helper ---
// VT323 can sometimes delay rendering, so we ensure standard font fallback
document.fonts.ready.then(() => {
  queueRender();
});

// --- State Management ---
const elements = [
  // Start with a standard Cylinder Flow (Uniform Flow + Doublet) as a demo
  { id: 1, type: 'doublet', name: 'cylinder_doublet', x: 0, y: 0, strength: 10.0 }
];

let nextElementId = 2;

const viewport = {
  centerX: 0,
  centerY: 0,
  scale: 60 // Pixels per math unit
};

const displayOptions = {
  streamfunctions: true,
  streamOffset: 0,
  streamSpacing: 0.5,
  potentials: false,
  potentialOffset: 0,
  potentialSpacing: 0.5,
  vectors: true,
  vectorGrid: 30,
  vectorScale: 1.0,
  stagnation: true,
  stagnationColor: 'red'
};

const uiState = {
  panning: false,
  panStart: { x: 0, y: 0 },
  panCenterStart: { x: 0, y: 0 },
  draggingElement: null,
  dragOffset: { x: 0, y: 0 },
  hoveredElement: null,
  sidebarOpen: true,
  spacePressed: false
};

// Global Uniform Flow
let globalU = 1.0;
let globalAlpha = 0; // in radians

// --- DOM References ---
const canvas = document.getElementById('flow-canvas');
const ctx = canvas.getContext('2d');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const elementList = document.getElementById('element-list');

// Inputs
const toggleStream = document.getElementById('toggle-stream');
const streamInputs = document.getElementById('stream-inputs');
const streamOffsetInput = document.getElementById('stream-offset');
const streamSpacingInput = document.getElementById('stream-spacing');

const togglePotential = document.getElementById('toggle-potential');
const potentialInputs = document.getElementById('potential-inputs');
const potentialOffsetInput = document.getElementById('potential-offset');
const potentialSpacingInput = document.getElementById('potential-spacing');

const toggleVectors = document.getElementById('toggle-vectors');
const vectorInputs = document.getElementById('vector-inputs');
const vectorGridInput = document.getElementById('vector-grid');
const vectorScaleInput = document.getElementById('vector-scale');

const toggleStagnation = document.getElementById('toggle-stagnation');
const stagnationInputs = document.getElementById('stagnation-inputs');
const stagnationColorRadios = document.getElementsByName('stagnation-color');

const globalUInput = document.getElementById('global-u');
const globalAlphaInput = document.getElementById('global-alpha');

const addElementBtn = document.getElementById('add-element-btn');
const elementTypeSelect = document.getElementById('element-type-select');

const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');

// --- Coordinate Conversions ---
function mathToScreen(x, y) {
  const sx = (x - viewport.centerX) * viewport.scale + canvas.width / 2;
  const sy = -(y - viewport.centerY) * viewport.scale + canvas.height / 2;
  return { x: sx, y: sy };
}

function screenToMath(sx, sy) {
  const x = (sx - canvas.width / 2) / viewport.scale + viewport.centerX;
  const y = -(sy - canvas.height / 2) / viewport.scale + viewport.centerY;
  return { x, y };
}

// --- Physics Engine (Superposition) ---

// Returns velocity components (u, v) in math coordinates
function getVelocity(x, y) {
  let u = globalU * Math.cos(globalAlpha);
  let v = globalU * Math.sin(globalAlpha);
  
  for (const el of elements) {
    const dx = x - el.x;
    const dy = y - el.y;
    const r2 = dx * dx + dy * dy;
    
    // Regularization factor to prevent dividing by zero near singularities
    const r2reg = r2 + 1e-6;
    
    if (el.type === 'source' || el.type === 'sink') {
      const factor = el.strength / (2 * Math.PI * r2reg);
      u += factor * dx;
      v += factor * dy;
    } else if (el.type === 'vortex') {
      const factor = el.strength / (2 * Math.PI * r2reg);
      u -= factor * dy;
      v += factor * dx;
    } else if (el.type === 'doublet') {
      const factor = -el.strength / (2 * Math.PI * r2reg * r2reg);
      u += factor * (dx * dx - dy * dy);
      v += factor * (2 * dx * dy);
    }
  }
  return { u, v };
}

// Returns streamfunction value (psi) at math coordinate (x, y)
function getStreamfunction(x, y) {
  let psi = globalU * (y * Math.cos(globalAlpha) - x * Math.sin(globalAlpha));
  
  for (const el of elements) {
    const dx = x - el.x;
    const dy = y - el.y;
    const r2 = dx * dx + dy * dy;
    
    if (el.type === 'source' || el.type === 'sink') {
      const theta = Math.atan2(dy, dx);
      psi += (el.strength / (2 * Math.PI)) * theta;
    } else if (el.type === 'vortex') {
      const r = Math.sqrt(r2 + 1e-6);
      psi -= (el.strength / (2 * Math.PI)) * Math.log(r);
    } else if (el.type === 'doublet') {
      psi -= (el.strength * dy) / (2 * Math.PI * (r2 + 1e-6));
    }
  }
  return psi;
}

// Computes adjusted continuous values for cell corners to eliminate branch-cut jumps
function getAdjustedValuesForCell(x_TL, y_TL, cellW, cellH) {
  const corners = [
    { x: x_TL, y: y_TL },
    { x: x_TL + cellW, y: y_TL },
    { x: x_TL + cellW, y: y_TL - cellH }, // Y math axis points up
    { x: x_TL, y: y_TL - cellH }
  ];
  
  const psiVals = corners.map(c => globalU * (c.y * Math.cos(globalAlpha) - c.x * Math.sin(globalAlpha)));
  const phiVals = corners.map(c => globalU * (c.x * Math.cos(globalAlpha) + c.y * Math.sin(globalAlpha)));
  
  for (const el of elements) {
    // 1. Calculate angles at all 4 corners
    const angles = corners.map(c => Math.atan2(c.y - el.y, c.x - el.x));
    
    // Adjust angles relative to corner 0 to enforce angular continuity within the cell
    const refAngle = angles[0];
    for (let i = 1; i < 4; i++) {
      let d = angles[i] - refAngle;
      if (d > Math.PI) angles[i] -= 2 * Math.PI;
      else if (d < -Math.PI) angles[i] += 2 * Math.PI;
    }
    
    // Calculate regularized distance
    const rs = corners.map(c => {
      const dx = c.x - el.x;
      const dy = c.y - el.y;
      return Math.sqrt(dx * dx + dy * dy + 1e-6);
    });
    
    for (let i = 0; i < 4; i++) {
      if (el.type === 'source' || el.type === 'sink') {
        psiVals[i] += (el.strength / (2 * Math.PI)) * angles[i];
        phiVals[i] += (el.strength / (2 * Math.PI)) * Math.log(rs[i]);
      } else if (el.type === 'vortex') {
        psiVals[i] -= (el.strength / (2 * Math.PI)) * Math.log(rs[i]);
        phiVals[i] += (el.strength / (2 * Math.PI)) * angles[i];
      } else if (el.type === 'doublet') {
        const dx = corners[i].x - el.x;
        const dy = corners[i].y - el.y;
        const r2reg = dx * dx + dy * dy + 1e-6;
        psiVals[i] -= (el.strength * dy) / (2 * Math.PI * r2reg);
        phiVals[i] += (el.strength * dx) / (2 * Math.PI * r2reg);
      }
    }
  }
  
  return { corners, psiVals, phiVals };
}

// --- Stagnation Point Locator (Newton-Raphson Solver) ---
function findStagnationPoints() {
  const points = [];
  if (!canvas.width || !canvas.height) return points;
  
  const minMath = screenToMath(0, canvas.height);
  const maxMath = screenToMath(canvas.width, 0);
  
  // Seed grid search in mathematical domain
  const nx = 36;
  const ny = 24;
  const dx = (maxMath.x - minMath.x) / nx;
  const dy = (maxMath.y - minMath.y) / ny;
  
  const grid = [];
  for (let i = 0; i <= nx; i++) {
    grid[i] = [];
    for (let j = 0; j <= ny; j++) {
      const mx = minMath.x + i * dx;
      const my = minMath.y + j * dy;
      const vel = getVelocity(mx, my);
      grid[i][j] = {
        x: mx,
        y: my,
        mag: Math.sqrt(vel.u * vel.u + vel.v * vel.v)
      };
    }
  }
  
  // Identify local minima candidates that are reasonably close to stagnation
  const baseU = Math.abs(globalU);
  const threshold = (baseU + 1.0) * 1.5;
  
  for (let i = 1; i < nx; i++) {
    for (let j = 1; j < ny; j++) {
      const center = grid[i][j];
      if (center.mag > threshold) continue;
      
      const left = grid[i-1][j].mag;
      const right = grid[i+1][j].mag;
      const down = grid[i][j-1].mag;
      const up = grid[i][j+1].mag;
      
      if (center.mag <= left && center.mag <= right && center.mag <= down && center.mag <= up) {
        // Converge to the exact roots using Newton-Raphson
        let sx = center.x;
        let sy = center.y;
        let converged = false;
        const maxIter = 12;
        const h = 1e-4; // Step for central difference derivatives
        
        for (let iter = 0; iter < maxIter; iter++) {
          const vel = getVelocity(sx, sy);
          const velMag = Math.sqrt(vel.u * vel.u + vel.v * vel.v);
          if (velMag < 1e-6) {
            converged = true;
            break;
          }
          
          // Compute finite difference approximation of derivatives
          const velXp = getVelocity(sx + h, sy);
          const velXm = getVelocity(sx - h, sy);
          const velYp = getVelocity(sx, sy + h);
          const velYm = getVelocity(sx, sy - h);
          
          const dudx = (velXp.u - velXm.u) / (2 * h);
          const dudy = (velYp.u - velYm.u) / (2 * h);
          const dvdx = (velXp.v - velXm.v) / (2 * h);
          const dvdy = (velYp.v - velYm.v) / (2 * h);
          
          // Jacobian determinant
          const det = dudx * dvdy - dudy * dvdx;
          if (Math.abs(det) < 1e-9) break;
          
          const deltaX = -(vel.u * dvdy - vel.v * dudy) / det;
          const deltaY = -(vel.v * dudx - vel.u * dvdx) / det;
          
          sx += deltaX;
          sy += deltaY;
          
          // Guard against divergence outside search area
          if (sx < minMath.x - dx || sx > maxMath.x + dx || sy < minMath.y - dy || sy > maxMath.y + dy) {
            break;
          }
          if (Math.abs(deltaX) < 1e-7 && Math.abs(deltaY) < 1e-7) {
            converged = true;
            break;
          }
        }
        
        if (converged) {
          const finalVel = getVelocity(sx, sy);
          const finalMag = Math.sqrt(finalVel.u * finalVel.u + finalVel.v * finalVel.v);
          if (finalMag < 1e-5) {
            // Keep points unique
            let isDuplicate = false;
            for (const p of points) {
              const distX = p.x - sx;
              const distY = p.y - sy;
              if (Math.sqrt(distX * distX + distY * distY) < 1e-2) {
                isDuplicate = true;
                break;
              }
            }
            if (!isDuplicate) {
              points.push({ x: sx, y: sy });
            }
          }
        }
      }
    }
  }
  
  return points;
}

// --- Marching Squares Contour Generator ---

// Standard Marching Squares Index Table
const msLookup = [
  [], // 0
  [[2, 3]], // 1
  [[1, 2]], // 2
  [[1, 3]], // 3
  [[0, 1]], // 4
  [[0, 1], [2, 3]], // 5
  [[0, 2]], // 6
  [[0, 3]], // 7
  [[0, 3]], // 8
  [[0, 2]], // 9
  [[0, 3], [1, 2]], // 10
  [[0, 1]], // 11
  [[1, 3]], // 12
  [[1, 2]], // 13
  [[2, 3]], // 14
  [] // 15
];

function generateCellContours(vals, corners, offset, spacing, segmentArray) {
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  
  const kMin = Math.ceil((minVal - offset) / spacing);
  const kMax = Math.floor((maxVal - offset) / spacing);
  
  for (let k = kMin; k <= kMax; k++) {
    const C = offset + k * spacing;
    
    // Evaluate binary states at corners
    const b0 = vals[0] >= C ? 1 : 0;
    const b1 = vals[1] >= C ? 1 : 0;
    const b2 = vals[2] >= C ? 1 : 0;
    const b3 = vals[3] >= C ? 1 : 0;
    
    const idx = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3;
    const lines = msLookup[idx];
    
    for (const edgePair of lines) {
      const p1 = interpolateEdgePoint(edgePair[0], vals, corners, C);
      const p2 = interpolateEdgePoint(edgePair[1], vals, corners, C);
      segmentArray.push({ p1, p2 });
    }
  }
}

// Draws a single custom contour (used for dividing streamlines)
function generateSpecialContour(vals, corners, targetValue, segmentArray) {
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  
  if (targetValue >= minVal && targetValue <= maxVal) {
    const b0 = vals[0] >= targetValue ? 1 : 0;
    const b1 = vals[1] >= targetValue ? 1 : 0;
    const b2 = vals[2] >= targetValue ? 1 : 0;
    const b3 = vals[3] >= targetValue ? 1 : 0;
    
    const idx = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3;
    const lines = msLookup[idx];
    
    for (const edgePair of lines) {
      const p1 = interpolateEdgePoint(edgePair[0], vals, corners, targetValue);
      const p2 = interpolateEdgePoint(edgePair[1], vals, corners, targetValue);
      segmentArray.push({ p1, p2 });
    }
  }
}

function interpolateEdgePoint(E, vals, corners, C) {
  const idxA = E;
  const idxB = (E + 1) % 4;
  
  const vA = vals[idxA];
  const vB = vals[idxB];
  const pA = corners[idxA];
  const pB = corners[idxB];
  
  if (Math.abs(vB - vA) < 1e-9) return { x: pA.x, y: pA.y };
  const t = (C - vA) / (vB - vA);
  return {
    x: pA.x + t * (pB.x - pA.x),
    y: pA.y + t * (pB.y - pA.y)
  };
}

// --- Canvas Drawing Function ---
function draw() {
  if (!canvas.width || !canvas.height) return;
  
  // 1. Clear with White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 2. Render pixel grid paper effect (dotted graph sheet)
  ctx.fillStyle = '#000000';
  const minMath = screenToMath(0, canvas.height);
  const maxMath = screenToMath(canvas.width, 0);
  
  const stepX = 1; // 1 math unit grid
  const startX = Math.floor(minMath.x);
  const endX = Math.ceil(maxMath.x);
  const startY = Math.floor(minMath.y);
  const endY = Math.ceil(maxMath.y);
  
  for (let gx = startX; gx <= endX; gx += stepX) {
    for (let gy = startY; gy <= endY; gy += stepX) {
      const sp = mathToScreen(gx, gy);
      // Only draw within screen bounds
      if (sp.x >= 0 && sp.x <= canvas.width && sp.y >= 0 && sp.y <= canvas.height) {
        ctx.fillRect(Math.floor(sp.x), Math.floor(sp.y), 1, 1);
      }
    }
  }
  
  // 3. Stagnation points and values
  let stagnationPoints = [];
  let stagnationVals = [];
  if (displayOptions.stagnation) {
    stagnationPoints = findStagnationPoints();
    stagnationVals = stagnationPoints.map(p => getStreamfunction(p.x, p.y));
  }
  
  // 4. Marching Squares loop
  const cellSize = 10; // 10px cells for fine resolution
  const cols = Math.ceil(canvas.width / cellSize);
  const rows = Math.ceil(canvas.height / cellSize);
  
  const streamSegments = [];
  const potentialSegments = [];
  const stagnationSegments = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx_left = c * cellSize;
      const sy_top = r * cellSize;
      
      const mathTL = screenToMath(sx_left, sy_top);
      const mathCellW = cellSize / viewport.scale;
      const mathCellH = cellSize / viewport.scale;
      
      // Compute math corners and continuous field values for this cell
      const cellData = getAdjustedValuesForCell(mathTL.x, mathTL.y, mathCellW, mathCellH);
      
      const screenCorners = [
        { x: sx_left, y: sy_top },
        { x: sx_left + cellSize, y: sy_top },
        { x: sx_left + cellSize, y: sy_top + cellSize },
        { x: sx_left, y: sy_top + cellSize }
      ];
      
      // Collect streamfunction contours
      if (displayOptions.streamfunctions) {
        generateCellContours(cellData.psiVals, screenCorners, displayOptions.streamOffset, displayOptions.streamSpacing, streamSegments);
      }
      
      // Collect complex potential contours
      if (displayOptions.potentials) {
        generateCellContours(cellData.phiVals, screenCorners, displayOptions.potentialOffset, displayOptions.potentialSpacing, potentialSegments);
      }
      
      // Collect dividing streamlines
      if (displayOptions.stagnation && stagnationVals.length > 0) {
        for (const stagVal of stagnationVals) {
          generateSpecialContour(cellData.psiVals, screenCorners, stagVal, stagnationSegments);
        }
      }
    }
  }
  
  // 5. Batch Stroke all lines
  
  // A. Complex Potentials (Dashed Black Lines)
  if (potentialSegments.length > 0) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (const seg of potentialSegments) {
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
    }
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash
  }
  
  // B. Streamlines (Solid Black Lines)
  if (streamSegments.length > 0) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const seg of streamSegments) {
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
    }
    ctx.stroke();
  }
  
  // C. Dividing Streamlines (Thick Line, Black or Red)
  if (stagnationSegments.length > 0) {
    ctx.strokeStyle = displayOptions.stagnationColor === 'red' ? '#ff0000' : '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const seg of stagnationSegments) {
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
    }
    ctx.stroke();
    ctx.lineWidth = 1; // Reset
  }
  
  // 6. Draw Velocity Vectors
  if (displayOptions.vectors) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    
    const vGrid = displayOptions.vectorGrid;
    const arrowS = displayOptions.vectorScale;
    
    // Draw arrows in grid
    for (let sx = vGrid / 2; sx < canvas.width; sx += vGrid) {
      for (let sy = vGrid / 2; sy < canvas.height; sy += vGrid) {
        const mathPos = screenToMath(sx, sy);
        const vel = getVelocity(mathPos.x, mathPos.y);
        const mag = Math.sqrt(vel.u * vel.u + vel.v * vel.v);
        
        if (mag < 1e-3) continue;
        
        // Cap magnitude to prevent infinite sizes near singularities
        const cappedMag = Math.min(mag, 8);
        const ratio = cappedMag / mag;
        
        // Compute arrow end position
        const vx = vel.u * ratio * arrowS * 12;
        const vy = -vel.v * ratio * arrowS * 12; // Invert Y
        
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const ex = sx + vx;
        const ey = sy + vy;
        ctx.lineTo(ex, ey);
        
        // Arrowhead
        const angle = Math.atan2(vy, vx);
        const headlen = 5;
        ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI / 6), ey - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI / 6), ey - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  }
  
  // 7. Draw Stagnation Points
  if (displayOptions.stagnation) {
    ctx.lineWidth = 1.5;
    for (const p of stagnationPoints) {
      const sp = mathToScreen(p.x, p.y);
      ctx.fillStyle = displayOptions.stagnationColor === 'red' ? '#ff0000' : '#000000';
      ctx.strokeStyle = '#000000';
      ctx.beginPath();
      // Retro rectangular stagnation indicator! Zero border radius
      ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
      ctx.strokeRect(sp.x - 4, sp.y - 4, 8, 8);
    }
  }
  
  // 8. Draw Flow Elements
  for (const el of elements) {
    const sp = mathToScreen(el.x, el.y);
    
    // Check hover/drag state
    const isDragged = uiState.draggingElement === el;
    const isHovered = uiState.hoveredElement === el;
    const isInverted = isDragged || isHovered;
    
    ctx.fillStyle = isInverted ? '#000000' : '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    
    // Zero border-radius square element
    ctx.fillRect(sp.x - 10, sp.y - 10, 20, 20);
    ctx.strokeRect(sp.x - 10, sp.y - 10, 20, 20);
    
    // Element Symbol
    ctx.fillStyle = isInverted ? '#ffffff' : '#000000';
    ctx.font = '16px "VT323"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let sym = '';
    if (el.type === 'source') sym = '+';
    else if (el.type === 'sink') sym = '-';
    else if (el.type === 'vortex') sym = 'V';
    else if (el.type === 'doublet') sym = 'D';
    
    ctx.fillText(sym, sp.x, sp.y);
    
    // Element Text Label
    ctx.fillStyle = '#000000';
    ctx.font = '14px "VT323"';
    ctx.fillText(el.name, sp.x, sp.y - 16);
  }
}

// --- Render Request Queue ---
let renderRequested = false;
function queueRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      draw();
    });
  }
}

// --- Sidebar Element List UI Renderer ---
function updateElementListUI() {
  elementList.innerHTML = '';
  
  if (elements.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'element-placeholder';
    placeholder.style.padding = '20px';
    placeholder.style.fontSize = '16px';
    placeholder.style.textAlign = 'center';
    placeholder.style.color = '#888888';
    placeholder.innerText = 'NO ELEMENTS ADDED. DOUBLE-CLICK CANVAS OR CLICK ADD.';
    elementList.appendChild(placeholder);
    return;
  }
  
  for (const el of elements) {
    const item = document.createElement('div');
    item.className = 'element-item';
    item.dataset.id = el.id;
    if (uiState.draggingElement === el) {
      item.classList.add('active-drag');
    }
    
    let typeBadge = '';
    if (el.type === 'source') typeBadge = 'SRC';
    else if (el.type === 'sink') typeBadge = 'SNK';
    else if (el.type === 'vortex') typeBadge = 'VTX';
    else if (el.type === 'doublet') typeBadge = 'DBL';
    
    item.innerHTML = `
      <div class="element-item-header">
        <input type="text" class="element-name-input" data-id="${el.id}" value="${el.name}">
        <span class="element-type-badge">${typeBadge}</span>
        <button class="btn-delete" data-id="${el.id}">X</button>
      </div>
      <div class="element-item-body">
        <div class="element-prop-row">
          <label>POS X:</label>
          <input type="number" id="el-${el.id}-x" data-id="${el.id}" data-prop="x" value="${el.x.toFixed(2)}" step="0.1">
        </div>
        <div class="element-prop-row">
          <label>POS Y:</label>
          <input type="number" id="el-${el.id}-y" data-id="${el.id}" data-prop="y" value="${el.y.toFixed(2)}" step="0.1">
        </div>
        <div class="element-prop-row">
          <label>STRENGTH:</label>
          <input type="number" id="el-${el.id}-strength" data-id="${el.id}" data-prop="strength" value="${el.strength.toFixed(2)}" step="0.5">
        </div>
      </div>
    `;
    elementList.appendChild(item);
  }
}

// --- Canvas Resize ---
function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  queueRender();
}

window.addEventListener('resize', resizeCanvas);
// Call initially
resizeCanvas();

// --- Event Handlers & Event Listeners ---

// 1. Sidebar Toggle
sidebarToggle.addEventListener('click', () => {
  uiState.sidebarOpen = !uiState.sidebarOpen;
  if (uiState.sidebarOpen) {
    sidebar.classList.remove('closed');
    sidebarToggle.classList.remove('closed');
    sidebarToggle.innerText = '<';
    sidebarToggle.style.left = '360px';
  } else {
    sidebar.classList.add('closed');
    sidebarToggle.classList.add('closed');
    sidebarToggle.innerText = '>';
    sidebarToggle.style.left = '0';
  }
  // Allow transitions to finish then resize canvas
  setTimeout(resizeCanvas, 220);
});

// 2. Display Options Changes
toggleStream.addEventListener('change', () => {
  displayOptions.streamfunctions = toggleStream.checked;
  streamInputs.style.display = displayOptions.streamfunctions ? 'block' : 'none';
  queueRender();
});
streamOffsetInput.addEventListener('input', () => {
  const val = parseFloat(streamOffsetInput.value);
  if (!isNaN(val)) {
    displayOptions.streamOffset = val;
    queueRender();
  }
});
streamSpacingInput.addEventListener('input', () => {
  const val = parseFloat(streamSpacingInput.value);
  if (!isNaN(val) && val > 0) {
    displayOptions.streamSpacing = val;
    queueRender();
  }
});

togglePotential.addEventListener('change', () => {
  displayOptions.potentials = togglePotential.checked;
  potentialInputs.style.display = displayOptions.potentials ? 'block' : 'none';
  queueRender();
});
potentialOffsetInput.addEventListener('input', () => {
  const val = parseFloat(potentialOffsetInput.value);
  if (!isNaN(val)) {
    displayOptions.potentialOffset = val;
    queueRender();
  }
});
potentialSpacingInput.addEventListener('input', () => {
  const val = parseFloat(potentialSpacingInput.value);
  if (!isNaN(val) && val > 0) {
    displayOptions.potentialSpacing = val;
    queueRender();
  }
});

toggleVectors.addEventListener('change', () => {
  displayOptions.vectors = toggleVectors.checked;
  vectorInputs.style.display = displayOptions.vectors ? 'block' : 'none';
  queueRender();
});
vectorGridInput.addEventListener('input', () => {
  const val = parseInt(vectorGridInput.value);
  if (!isNaN(val) && val >= 10) {
    displayOptions.vectorGrid = val;
    queueRender();
  }
});
vectorScaleInput.addEventListener('input', () => {
  const val = parseFloat(vectorScaleInput.value);
  if (!isNaN(val) && val > 0) {
    displayOptions.vectorScale = val;
    queueRender();
  }
});

toggleStagnation.addEventListener('change', () => {
  displayOptions.stagnation = toggleStagnation.checked;
  stagnationInputs.style.display = displayOptions.stagnation ? 'block' : 'none';
  queueRender();
});
stagnationColorRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      displayOptions.stagnationColor = radio.value;
      queueRender();
    }
  });
});

// 3. Global Flow variables
globalUInput.addEventListener('input', () => {
  const val = parseFloat(globalUInput.value);
  if (!isNaN(val)) {
    globalU = val;
    queueRender();
  }
});
globalAlphaInput.addEventListener('input', () => {
  const val = parseFloat(globalAlphaInput.value);
  if (!isNaN(val)) {
    globalAlpha = (val * Math.PI) / 180; // Degrees to radians
    queueRender();
  }
});

// 4. Element CRUD
function addElement(type, x, y) {
  let strength = 1.0;
  if (type === 'sink') {
    type = 'source';
    strength = -1.0;
  } else if (type === 'doublet') {
    strength = 10.0;
  }
  
  const id = nextElementId++;
  const name = `${type}_${id}`;
  elements.push({ id, type, name, x, y, strength });
  
  updateElementListUI();
  queueRender();
}

addElementBtn.addEventListener('click', () => {
  const type = elementTypeSelect.value;
  addElement(type, viewport.centerX, viewport.centerY);
});

// Element list interaction delegation
elementList.addEventListener('input', e => {
  const id = parseInt(e.target.dataset.id);
  const el = elements.find(item => item.id === id);
  if (!el) return;
  
  if (e.target.classList.contains('element-name-input')) {
    el.name = e.target.value;
    queueRender();
  } else {
    const prop = e.target.dataset.prop;
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      el[prop] = val;
      // Sync canvas elements
      queueRender();
    }
  }
});

elementList.addEventListener('click', e => {
  if (e.target.classList.contains('btn-delete')) {
    const id = parseInt(e.target.dataset.id);
    const index = elements.findIndex(item => item.id === id);
    if (index !== -1) {
      elements.splice(index, 1);
      updateElementListUI();
      queueRender();
    }
  }
});

// 5. Zoom & Pan Controls
function adjustZoom(factor, reset = false) {
  if (reset) {
    viewport.scale = 60;
    viewport.centerX = 0;
    viewport.centerY = 0;
  } else {
    let newScale = viewport.scale * factor;
    // Limits: 10% to 250% of base scale 50.
    // 10% * 50 = 5. 250% * 50 = 125.
    newScale = Math.max(5, Math.min(125, newScale));
    viewport.scale = newScale;
  }
  queueRender();
}

zoomInBtn.addEventListener('click', () => adjustZoom(1.2));
zoomOutBtn.addEventListener('click', () => adjustZoom(1 / 1.2));
zoomResetBtn.addEventListener('click', () => adjustZoom(1, true));

// 6. Keyboard Listeners (Spacebar)
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    uiState.spacePressed = true;
    if (document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); // Prevent scroll down
      canvas.style.cursor = 'grab';
    }
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    uiState.spacePressed = false;
    canvas.style.cursor = 'crosshair';
  }
});

// 7. Mouse Listeners for Canvas (Pan, Zoom, Drag & Drop, Double Click)
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  
  // Zoom under mouse cursor
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const mathPos = screenToMath(mouseX, mouseY);
  
  // Compute new scale
  let newScale = viewport.scale * (1 - e.deltaY * 0.001);
  newScale = Math.max(5, Math.min(125, newScale));
  viewport.scale = newScale;
  
  // Adjust center so the mathPos is still under mouseX, mouseY
  const newMathPos = screenToMath(mouseX, mouseY);
  viewport.centerX += (mathPos.x - newMathPos.x);
  viewport.centerY += (mathPos.y - newMathPos.y);
  
  queueRender();
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  
  if (uiState.spacePressed) {
    // Start Panning
    uiState.panning = true;
    uiState.panStart = { x: e.clientX, y: e.clientY };
    uiState.panCenterStart = { x: viewport.centerX, y: viewport.centerY };
    canvas.style.cursor = 'grabbing';
  } else {
    // Check if clicking near any element to drag
    const clickMath = screenToMath(sx, sy);
    let found = null;
    
    for (const el of elements) {
      const elScreen = mathToScreen(el.x, el.y);
      const dist = Math.hypot(sx - elScreen.x, sy - elScreen.y);
      if (dist < 15) { // 15px radius click zone
        found = el;
        break;
      }
    }
    
    if (found) {
      uiState.draggingElement = found;
      uiState.dragOffset = { x: clickMath.x - found.x, y: clickMath.y - found.y };
      
      // Visual feedback in sidebar
      const listItems = elementList.querySelectorAll('.element-item');
      listItems.forEach(item => {
        if (parseInt(item.dataset.id) === found.id) {
          item.classList.add('active-drag');
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  
  if (uiState.panning) {
    const dx = e.clientX - uiState.panStart.x;
    const dy = e.clientY - uiState.panStart.y;
    
    // Scale shift
    viewport.centerX = uiState.panCenterStart.x - dx / viewport.scale;
    viewport.centerY = uiState.panCenterStart.y + dy / viewport.scale; // Screen Y goes down, math Y goes up
    queueRender();
  } else if (uiState.draggingElement) {
    const moveMath = screenToMath(sx, sy);
    uiState.draggingElement.x = moveMath.x - uiState.dragOffset.x;
    uiState.draggingElement.y = moveMath.y - uiState.dragOffset.y;
    
    // Update numerical inputs in sidebar directly
    const inputX = document.getElementById(`el-${uiState.draggingElement.id}-x`);
    const inputY = document.getElementById(`el-${uiState.draggingElement.id}-y`);
    if (inputX) inputX.value = uiState.draggingElement.x.toFixed(2);
    if (inputY) inputY.value = uiState.draggingElement.y.toFixed(2);
    
    queueRender();
  } else {
    // Mouse hover check for elements
    let hovered = null;
    for (const el of elements) {
      const elScreen = mathToScreen(el.x, el.y);
      const dist = Math.hypot(sx - elScreen.x, sy - elScreen.y);
      if (dist < 15) {
        hovered = el;
        break;
      }
    }
    
    if (hovered !== uiState.hoveredElement) {
      uiState.hoveredElement = hovered;
      queueRender();
    }
    
    // Update cursor
    if (hovered) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = uiState.spacePressed ? 'grab' : 'crosshair';
    }
  }
});

canvas.addEventListener('mouseup', () => {
  if (uiState.panning) {
    uiState.panning = false;
    canvas.style.cursor = uiState.spacePressed ? 'grab' : 'crosshair';
  }
  
  if (uiState.draggingElement) {
    // Remove active-drag classes
    const listItems = elementList.querySelectorAll('.element-item');
    listItems.forEach(item => item.classList.remove('active-drag'));
    
    uiState.draggingElement = null;
    queueRender();
  }
});

canvas.addEventListener('mouseleave', () => {
  uiState.panning = false;
  if (uiState.draggingElement) {
    const listItems = elementList.querySelectorAll('.element-item');
    listItems.forEach(item => item.classList.remove('active-drag'));
    uiState.draggingElement = null;
  }
  uiState.hoveredElement = null;
  queueRender();
});

// Double click canvas to add an element at the mouse pointer
canvas.addEventListener('dblclick', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  
  const mathPos = screenToMath(sx, sy);
  const type = elementTypeSelect.value;
  addElement(type, mathPos.x, mathPos.y);
});

// --- Initial Startup ---
updateElementListUI();
queueRender();
