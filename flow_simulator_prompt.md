# AI Agent Instruction Prompt: 2D Incompressible Flow Simulator Web App

You are an expert web developer and computational fluid dynamics (CFD) engineer. Your task is to build a highly interactive, client-side web application that visualizes 2D incompressible potential flow fields using the principle of superposition. 

The app must be built as a static site (e.g., pure HTML/CSS/JS or a statically exported React/Vite app) so it can be hosted directly on GitHub Pages.

## 1. UI & Design System
* **Theme**: Strict Black and White. No shades of gray unless absolutely necessary for antialiasing.
* **Typography**: Use a clearly legible Pixel Font (e.g., 'Press Start 2P', 'VT323', or similar Google Font).
* **Geometry**: Pure rectangular elements. **Zero border-radius anywhere** (no rounded corners).
* **Layout**:
  * Full-screen HTML Canvas for the flow visualization.
  * A pull-out sidebar on the left-hand side containing all controls.
  * Zoom controls (+ / - buttons) anchored in the bottom right corner of the screen.

## 2. Canvas & Interactions
* **Auto-refresh**: The canvas must re-render instantly whenever *any* parameter (position, strength, uniform flow, display option) is changed.
* **Pan & Zoom**:
  * Pan the canvas by holding `Spacebar` + `Mouse Click & Drag`.
  * Zoom in/out using the `Scroll Wheel` (or the +/- buttons in the bottom right).
  * Zoom limits: 10% to 250%.
* **Element Dragging**: Flow elements (Sources, Sinks, Vortices) rendered on the canvas must be draggable via mouse. Dragging an element should update its numerical X/Y coordinates in the sidebar in real-time.

## 3. Sidebar Configuration
The left sidebar must have the following sections, ordered from top to bottom:

### A. Display Options
* **Streamfunctions ($\psi$)**: Toggle checkbox. Inputs for `offset` and `spacing` to determine which contour lines to draw.
* **Complex Potentials ($\phi$)**: Toggle checkbox. Inputs for `offset` and `spacing`.
* **Velocity Vectors**: Toggle checkbox. 
  * Input for `grid spacing` (distance between vector origins).
  * Input for `arrow scale` (multiplier for vector length, e.g., if velocity is 10m/s and scale is 0.5, draw it 5 units long).
* **Stagnation Points**: Toggle checkbox. 
  * Option toggle: Render in `Black` or `Red` (the only exception to the B&W rule). Stagnation streamlines/points should be drawn with a thicker line stroke (`lineWidth: 3` or similar).

### B. Global Flow Variables
* **Uniform Flow**: Inputs for `Magnitude (U)` and `Direction (Angle/Degrees)`.

### C. Element List
* A dynamically generated list of added elements (e.g., `source_1`, `sink_1`, `vortex_1`).
* Each item in the list must have:
  * Editable Name label.
  * Editable Number inputs for `X` and `Y` position (updates if dragged on canvas).
  * Editable Number input for `Strength` (m or $\Gamma$). For sinks, this will just be a negative source strength.
* **Add Button**: A button at the bottom of the list to add a new Source, Sink, or Vortex. 

## 4. Mathematics & Physics Engine (Superposition)
Calculate the flow field by superimposing the elementary flows. Calculate the velocity field $(u, v)$ and streamfunction $\psi$ at any given point $(x, y)$ by summing the contributions from all active elements.

**Reference Formulas:**
*(Note: $r = \sqrt{(x-x_0)^2 + (y-y_0)^2}$ and $\theta = \text{atan2}(y-y_0, x-x_0)$ for an element at $(x_0, y_0)$)*

* **Uniform Flow (at angle $\alpha$)**:
  * $u = U \cos(\alpha)$, $v = U \sin(\alpha)$
  * $\psi = U (y \cos\alpha - x \sin\alpha)$
  * $\phi = U (x \cos\alpha + y \sin\alpha)$

* **Source (Strength $+m$) / Sink (Strength $-m$)**:
  * Radial velocity: $u_r = \frac{m}{2\pi r}$, $u_\theta = 0$
  * Cartesian velocity: $u = \frac{m}{2\pi r} \cos\theta$, $v = \frac{m}{2\pi r} \sin\theta$
  * $\psi = \frac{m}{2\pi} \theta$
  * $\phi = \frac{m}{2\pi} \ln(r)$

* **Vortex (Strength $\Gamma$)**:
  * Tangential velocity: $u_r = 0$, $u_\theta = \frac{\Gamma}{2\pi r}$
  * Cartesian velocity: $u = -\frac{\Gamma}{2\pi r} \sin\theta$, $v = \frac{\Gamma}{2\pi r} \cos\theta$
  * $\psi = -\frac{\Gamma}{2\pi} \ln(r)$
  * $\phi = \frac{\Gamma}{2\pi} \theta$

**(Optional/Bonus: Doublet ($x$-wise))*
  * $u_r = -\frac{\mu \cos\theta}{2\pi r^2}$, $u_\theta = -\frac{\mu \sin\theta}{2\pi r^2}$
  * $\psi = -\frac{\mu \sin\theta}{2\pi r}$
  * $\phi = \frac{\mu \cos\theta}{2\pi r}$

## 5. Rendering Implementation Notes
1. **Contour Plotting (Streamlines & Potentials)**: Since $\psi$ and $\phi$ are scalar fields, you should implement a Marching Squares algorithm to find and draw the contour lines for the user-specified constant values (determined by the offset and spacing inputs).
2. **Velocity Vectors**: Iterate over a grid. At each point, calculate total $(u, v)$. Draw an arrow using Canvas 2D API (`lineTo`, `moveTo`) pointing in the direction of $(u, v)$ with a length scaled by the `arrow scale` input.
3. **Stagnation Points**: Search the grid/field for areas where $\sqrt{u^2 + v^2} \approx 0$. Highlight these points and ideally trace the dividing streamline passing through them.
4. **Coordinate System**: Ensure the math coordinate system maps correctly to the screen/canvas coordinate system (where Y normally points down in HTML canvas, so you will need to invert the Y-axis rendering for standard Cartesian mathematical plotting).

## Output Expectations
Please provide the complete codebase (HTML, CSS, JS) required to run this application locally, ensuring everything is structured so I can easily drop it into a GitHub repository and deploy via GitHub Pages.
