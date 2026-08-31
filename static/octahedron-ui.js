/* Interactive perverse-Hodge octahedron. Coordinates in the JSON files are doubled. */
(function() {
  const recordPromises = new Map();
  const defaultView = { yaw: -0.72, pitch: 0.42 };

  function cameraPoint(x, y, z, view) {
    const cosYaw = Math.cos(view.yaw);
    const sinYaw = Math.sin(view.yaw);
    const cosPitch = Math.cos(view.pitch);
    const sinPitch = Math.sin(view.pitch);
    const rotatedX = x * cosYaw - y * sinYaw;
    const rotatedY = x * sinYaw + y * cosYaw;
    return {
      x: rotatedX,
      y: rotatedY * sinPitch - z * cosPitch,
      depth: rotatedY * cosPitch + z * sinPitch,
    };
  }

  function project(point, view, scale, centerX, centerY) {
    const camera = cameraPoint(...point, view);
    return {
      x: centerX + camera.x * scale,
      y: centerY + camera.y * scale,
      depth: camera.depth,
    };
  }

  function drawLine(context, from, to, dash = []) {
    context.setLineDash(dash);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.setLineDash([]);
  }

  function drawPolygon(context, points) {
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  }

  function pointsInDegree(record, degree) {
    if (!record._pointsByDegree) {
      record._pointsByDegree = new Map();
      record.points.forEach((point) => {
        const pointDegree = point[2] + record.dim;
        if (!record._pointsByDegree.has(pointDegree)) record._pointsByDegree.set(pointDegree, []);
        record._pointsByDegree.get(pointDegree).push(point);
      });
    }
    return record._pointsByDegree.get(degree) || [];
  }

  function drawCanvas(widget, record, degree) {
    const canvas = widget.querySelector("canvas");
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = Math.round(bounds.width * pixelRatio);
    const canvasHeight = Math.round(bounds.height * pixelRatio);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const radius = record.dim / 2;
    const selectedZ = (degree - record.dim) / 2;
    const view = defaultView;
    const vertices = [
      [radius, 0, 0], [-radius, 0, 0],
      [0, radius, 0], [0, -radius, 0],
      [0, 0, radius], [0, 0, -radius],
    ];
    const cameraVertices = vertices.map((vertex) => cameraPoint(...vertex, view));
    const minX = Math.min(...cameraVertices.map((point) => point.x));
    const maxX = Math.max(...cameraVertices.map((point) => point.x));
    const minY = Math.min(...cameraVertices.map((point) => point.y));
    const maxY = Math.max(...cameraVertices.map((point) => point.y));
    const padding = 30;
    const scale = Math.min(
      (bounds.width - 2 * padding) / Math.max(maxX - minX, 1),
      (bounds.height - 2 * padding) / Math.max(maxY - minY, 1),
    );
    const centerX = bounds.width / 2 - (minX + maxX) * scale / 2;
    const centerY = bounds.height / 2 - (minY + maxY) * scale / 2;
    const projectedVertices = vertices.map((vertex) => project(vertex, view, scale, centerX, centerY));
    const cameraDirection = [
      Math.sin(view.yaw) * Math.cos(view.pitch),
      Math.cos(view.yaw) * Math.cos(view.pitch),
      Math.sin(view.pitch),
    ];
    const faces = [
      { vertices: [0, 2, 4], normal: [1, 1, 1] },
      { vertices: [0, 3, 4], normal: [1, -1, 1] },
      { vertices: [1, 2, 4], normal: [-1, 1, 1] },
      { vertices: [1, 3, 4], normal: [-1, -1, 1] },
      { vertices: [0, 2, 5], normal: [1, 1, -1] },
      { vertices: [0, 3, 5], normal: [1, -1, -1] },
      { vertices: [1, 2, 5], normal: [-1, 1, -1] },
      { vertices: [1, 3, 5], normal: [-1, -1, -1] },
    ].map((face) => {
      const normalDepth = face.normal.reduce(
        (total, coordinate, index) => total + coordinate * cameraDirection[index],
        0,
      );
      return {
        ...face,
        front: normalDepth > 0,
        depth: face.vertices.reduce((total, index) => total + projectedVertices[index].depth, 0) / 3,
        shade: Math.max(0, Math.min(1, (normalDepth / Math.sqrt(3) + 1) / 2)),
      };
    });

    function drawFaces(front) {
      faces
        .filter((face) => face.front === front)
        .sort((first, second) => first.depth - second.depth)
        .forEach((face) => {
          const tone = Math.round(82 + face.shade * 55);
          const alpha = front ? 0.11 : 0.03;
          context.fillStyle = `rgba(${tone - 18}, ${tone - 8}, ${tone}, ${alpha})`;
          drawPolygon(context, face.vertices.map((index) => projectedVertices[index]));
          context.fill();
        });
    }

    drawFaces(false);

    const edges = [];
    for (let first = 0; first < vertices.length; first++) {
      for (let second = first + 1; second < vertices.length; second++) {
        if (Math.floor(first / 2) === Math.floor(second / 2)) continue;
        const adjacentFaces = faces.filter(
          (face) => face.vertices.includes(first) && face.vertices.includes(second),
        );
        edges.push({
          first,
          second,
          front: adjacentFaces.some((face) => face.front),
          depth: (projectedVertices[first].depth + projectedVertices[second].depth) / 2,
        });
      }
    }

    const selectedRadius = Math.max(0, radius - Math.abs(selectedZ));
    const selectedPlane = [
      [selectedRadius, 0, selectedZ],
      [0, selectedRadius, selectedZ],
      [-selectedRadius, 0, selectedZ],
      [0, -selectedRadius, selectedZ],
    ].map((point) => project(point, view, scale, centerX, centerY));
    if (selectedRadius > 0) {
      const planeGradient = context.createLinearGradient(0, Math.min(...selectedPlane.map((point) => point.y)), 0, Math.max(...selectedPlane.map((point) => point.y)));
      planeGradient.addColorStop(0, "rgba(14, 116, 189, 0.1)");
      planeGradient.addColorStop(1, "rgba(3, 80, 150, 0.2)");
      context.fillStyle = planeGradient;
      drawPolygon(context, selectedPlane);
      context.fill();
    } else {
      context.beginPath();
      context.arc(selectedPlane[0].x, selectedPlane[0].y, 4.5, 0, Math.PI * 2);
      context.fillStyle = "rgba(3, 80, 150, 0.9)";
      context.fill();
    }

    drawFaces(true);

    pointsInDegree(record, degree).forEach(([x2, y2, z2]) => {
      const point = project([x2 / 2, y2 / 2, z2 / 2], view, scale, centerX, centerY);
      const depthRange = Math.max(radius * 2, 1);
      const depthFactor = Math.max(0, Math.min(1, (point.depth + radius) / depthRange));
      const pointRadius = 2.7 + depthFactor * 1.6;
      context.beginPath();
      context.arc(point.x, point.y, pointRadius + 1.4, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 255, 255, 0.8)";
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
      context.fillStyle = `rgba(220, 53, 69, ${0.68 + depthFactor * 0.3})`;
      context.fill();
    });

    context.strokeStyle = "rgba(71, 85, 105, 0.38)";
    context.lineWidth = 1;
    edges
      .filter((edge) => !edge.front)
      .sort((first, second) => first.depth - second.depth)
      .forEach((edge) => drawLine(
        context,
        projectedVertices[edge.first],
        projectedVertices[edge.second],
        [4, 4],
      ));

    context.strokeStyle = "rgba(30, 41, 59, 0.82)";
    context.lineWidth = 1.45;
    edges
      .filter((edge) => edge.front)
      .sort((first, second) => first.depth - second.depth)
      .forEach((edge) => drawLine(
        context,
        projectedVertices[edge.first],
        projectedVertices[edge.second],
      ));

    if (selectedRadius > 0) {
      context.strokeStyle = "rgba(3, 80, 150, 0.9)";
      context.lineWidth = 2;
      drawPolygon(context, selectedPlane);
      context.stroke();
    }

    projectedVertices.forEach((point) => {
      context.beginPath();
      context.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
      context.fillStyle = "rgba(30, 41, 59, 0.82)";
      context.fill();
    });

    context.fillStyle = "#343a40";
    const axisLabels = [
      [[0, 0, radius], "degree"],
    ];
    axisLabels.forEach(([vertex, label]) => {
      const point = project(vertex, view, scale, centerX, centerY);
      context.font = "14px Georgia, serif";
      context.strokeStyle = "rgba(255, 255, 255, 0.92)";
      context.lineWidth = 3.5;
      context.strokeText(label, point.x + 7, point.y - 5);
      context.fillStyle = "#343a40";
      context.fillText(label, point.x + 7, point.y - 5);
    });

    canvas.setAttribute(
      "aria-label",
      `Perverse-Hodge octahedron with the cohomological degree ${degree} slice selected.`,
    );
  }

  function cellLabel(x2, y2, degree, value) {
    const half = (coordinate) => coordinate % 2 === 0 ? String(coordinate / 2) : `${coordinate}/2`;
    return `Hodge index ${half(x2)}, perverse index ${half(y2)}, cohomological degree ${degree}: ${value}`;
  }

  function renderSlice(widget, record, degree) {
    const selectedZ2 = degree - record.dim;
    const radius2 = record.dim - Math.abs(selectedZ2);
    const values = new Map();
    pointsInDegree(record, degree).forEach(([x2, y2, z2, multiplicity]) => {
      if (z2 === selectedZ2) values.set(`${x2},${y2}`, multiplicity);
    });

    const grid = widget.querySelector(".octahedron-grid");
    grid.replaceChildren();
    const count = radius2 + 1;
    grid.style.setProperty("--octahedron-count", count);
    grid.setAttribute("aria-rowcount", count);
    grid.setAttribute("aria-colcount", count);

    for (let y2 = radius2; y2 >= -radius2; y2 -= 2) {
      const row = document.createElement("span");
      row.className = "octahedron-row";
      row.setAttribute("role", "row");
      for (let x2 = -radius2; x2 <= radius2; x2 += 2) {
        const cell = document.createElement("span");
        if (Math.abs(x2) + Math.abs(y2) <= radius2) {
          const value = values.get(`${x2},${y2}`) || 0;
          cell.className = `octahedron-cell${value === 0 ? " octahedron-zero" : ""}`;
          cell.textContent = String(value);
          cell.setAttribute("role", "gridcell");
          cell.setAttribute("aria-label", cellLabel(x2, y2, degree, value));
          cell.title = cellLabel(x2, y2, degree, value);
        } else {
          cell.className = "octahedron-cell octahedron-outside";
          cell.setAttribute("aria-hidden", "true");
        }
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }

    widget.querySelector(".octahedron-slice-title").innerHTML = `horizontal slice: H<sup>${degree}</sup>(X)`;
    drawCanvas(widget, record, degree);
  }

  function createInterface(widget, record) {
    const visual = document.createElement("div");
    visual.className = "octahedron-visual";

    const controls = document.createElement("div");
    controls.className = "octahedron-controls";
    const slider = document.createElement("input");
    slider.id = `octahedron-degree-${widget.dataset.octahedronKey}`;
    slider.type = "range";
    slider.min = "0";
    slider.max = String(2 * record.dim);
    slider.step = "1";
    slider.value = String(record.dim);
    slider.setAttribute("aria-label", "Cohomological degree");
    const scale = document.createElement("div");
    scale.className = "octahedron-degree-scale";
    scale.innerHTML = `<span>H<sup>0</sup></span><span>H<sup>${record.dim}</sup></span><span>H<sup>${2 * record.dim}</sup></span>`;
    controls.append(slider, scale);
    visual.appendChild(controls);

    const reader = document.createElement("div");
    reader.className = "octahedron-reader";

    const orientation = document.createElement("div");
    orientation.className = "octahedron-orientation";
    const orientationTitle = document.createElement("p");
    orientationTitle.className = "octahedron-orientation-title";
    orientationTitle.textContent = "octahedron";
    const canvas = document.createElement("canvas");
    canvas.className = "octahedron-canvas";
    canvas.setAttribute("role", "img");
    const legend = document.createElement("ul");
    legend.className = "octahedron-legend";
    legend.innerHTML = [
      '<li><span class="octahedron-key octahedron-key-outline"></span>full boundary</li>',
      '<li><span class="octahedron-key octahedron-key-plane"></span>selected slice</li>',
      '<li><span class="octahedron-key octahedron-key-point"></span>nonzero entry</li>',
    ].join("");
    orientation.append(orientationTitle, canvas, legend);

    const slice = document.createElement("div");
    slice.className = "octahedron-slice";
    const title = document.createElement("p");
    title.className = "octahedron-slice-title text-center";
    const gridFrame = document.createElement("div");
    gridFrame.className = "octahedron-grid-frame";
    const scroller = document.createElement("div");
    scroller.className = "octahedron-slice-scroller";
    const grid = document.createElement("div");
    grid.className = "octahedron-grid";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Perverse-Hodge entries");
    scroller.appendChild(grid);
    gridFrame.appendChild(scroller);
    slice.append(title, gridFrame);
    reader.append(slice, orientation);
    visual.appendChild(reader);

    const hint = document.createElement("p");
    hint.className = "octahedron-hint text-center";
    hint.innerHTML = "Each number is an entry h<sup>i,k,d</sup>. Summing in either direction recovers the corresponding Hodge number.";
    widget.replaceChildren(visual, hint);

    slider.addEventListener("input", () => renderSlice(widget, record, Number(slider.value)));
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(
        () => drawCanvas(widget, record, Number(slider.value)),
      );
      observer.observe(canvas);
      widget._octahedronObserver = observer;
    }
    renderSlice(widget, record, record.dim);
  }

  function loadRecord(key) {
    if (!recordPromises.has(key)) {
      const path = `/octahedron-data/${encodeURIComponent(key)}.json`;
      const request = fetch(path, { cache: "force-cache", credentials: "same-origin" })
        .then((response) => {
          if (!response.ok) throw new Error(`could not load ${path}`);
          return response.json();
        })
        .catch((error) => {
          recordPromises.delete(key);
          throw error;
        });
      recordPromises.set(key, request);
    }
    return recordPromises.get(key);
  }

  async function renderWidget(widget, key) {
    if (!widget || widget.dataset.octahedronBound) return;
    widget.dataset.octahedronBound = "loading";
    try {
      const record = await loadRecord(key);
      createInterface(widget, record);
      widget.dataset.octahedronBound = "ready";
    } catch (error) {
      widget.dataset.octahedronBound = "";
      widget.innerHTML = '<p class="alert alert-warning">The perverse-Hodge data could not be loaded.</p>';
      console.error(error);
    }
  }

  window.PerverseHodgeOctahedron = { renderWidget };
})();
