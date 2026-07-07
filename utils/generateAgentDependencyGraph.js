#!/usr/bin/env node
/**
 * generateAgentDependencyGraph.js
 *
 * Generates an interactive HTML agent dependency graph.
 * Visualizes:
 *   - Full dependency chain (DecisionAgent → ExecutionEngine → ... → Reporting)
 *   - Agents by execution stage (color-coded)
 *   - Dependency edges with direction arrows
 *   - Interactive zoom, pan, hover details
 *   - Filter by stage, search by name
 *
 * Output: reports/ai/agent-dependency-graph.html
 *
 * Usage:
 *   node utils/generateAgentDependencyGraph.js
 *   npm run deps:graph
 */

const fs = require('fs-extra');
const path = require('path');

const ROOT = process.cwd();
const AGENTS_DIR = path.join(ROOT, 'ai', 'agents');
const CORE_DIR = path.join(ROOT, 'ai', 'core');
const OUTPUT = path.join(ROOT, 'reports', 'ai', 'agent-dependency-graph.html');

// ─── Stage Colors ──────────────────────────────────────────────────────────
const STAGE_COLORS = {
  preflight:    '#58a6ff',
  execution:    '#3fb950',
  analysis:     '#d29922',
  'multi-agent':'#bc8cff',
  reporting:    '#f778ba',
  cleanup:      '#8b949e'
};

const STAGE_ORDER = ['preflight', 'execution', 'analysis', 'multi-agent', 'reporting', 'cleanup'];

// ─── Load Agents and Dependencies ──────────────────────────────────────────

function loadAgents() {
  const registry = require('../ai/core/AgentRegistry');
  // We need to do a sync require of all agents to discover them
  const allAgents = registry.getAll();
  
  const nodes = [];
  const edges = [];
  const nodeMap = {};
  
  for (const agent of allAgents) {
    const key = agent.key;
    const meta = agent.metadata || {};
    const stage = meta.executionStage || 'unknown';
    const deps = meta.dependencies || [];
    
    nodeMap[key] = {
      id: key,
      name: meta.name || key,
      stage: stage,
      priority: meta.priority || 50,
      platforms: (meta.platforms || []).join(', '),
      tags: (meta.tags || []).join(', '),
      lifecycle: meta.lifecycle || 'active',
      version: meta.version || '1.0.0',
      description: meta.description || '',
      hasRun: agent.hasRun || false
    };
    
    for (const dep of deps) {
      edges.push({ source: key, target: dep });
    }
  }
  
  // Add all nodes to array
  for (const [key, node] of Object.entries(nodeMap)) {
    nodes.push(node);
  }
  
  // Resolve edge targets to node references
  for (const edge of edges) {
    if (nodeMap[edge.target]) {
      edge.targetNode = nodeMap[edge.target];
    }
  }
  
  return { nodes, edges, nodeMap };
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     HTML GENERATION                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function generateHTML(data) {
  const { nodes, edges, nodeMap } = data;
  
  const nodesJson = JSON.stringify(nodes);
  const edgesJson = JSON.stringify(edges.map(e => ({
    source: e.source,
    target: e.target
  })));
  const stageColorsJson = JSON.stringify(STAGE_COLORS);
  const stageOrderJson = JSON.stringify(STAGE_ORDER);
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Dependency Graph</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  :root {
    --bg: #0d1117; --card: #161b22; --border: #30363d;
    --text: #c9d1d9; --text-muted: #8b949e;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg); color: var(--text); height: 100vh; overflow: hidden; }
  
  #container { display: flex; height: 100vh; }
  #sidebar { width: 300px; background: var(--card); border-right: 1px solid var(--border);
    padding: 16px; overflow-y: auto; flex-shrink: 0; }
  #graph { flex: 1; position: relative; }
  #graph svg { width: 100%; height: 100%; }
  
  #sidebar h1 { font-size: 18px; margin-bottom: 8px; color: #58a6ff; }
  #sidebar .subtitle { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
  
  .section-title { font-size: 13px; font-weight: 600; color: var(--text); margin: 16px 0 8px; }
  
  .stage-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .stage-btn { padding: 3px 10px; border-radius: 12px; border: 1px solid var(--border);
    background: transparent; color: var(--text); cursor: pointer; font-size: 11px; }
  .stage-btn:hover { background: rgba(255,255,255,0.05); }
  .stage-btn.active { border-color: var(--blue); background: rgba(88,166,255,0.1); color: #58a6ff; }
  
  #search { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border);
    background: #0d1117; color: var(--text); font-size: 13px; outline: none; margin-bottom: 12px; }
  #search:focus { border-color: #58a6ff; }
  
  #legend { margin-top: 16px; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
  .legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  
  #stats { font-size: 12px; color: var(--text-muted); margin-top: 12px; }
  #stats span { color: var(--text); }
  
  #tooltip { position: absolute; background: #1c2333; border: 1px solid var(--border);
    border-radius: 8px; padding: 12px; font-size: 12px; pointer-events: none;
    max-width: 320px; display: none; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
  #tooltip .tt-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  #tooltip .tt-detail { color: var(--text-muted); margin: 2px 0; }
  #tooltip .tt-deps { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
  
  #main-chain { margin-bottom: 16px; }
  .chain-node { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
    border-radius: 4px; font-size: 11px; margin: 2px 0; cursor: pointer; }
  .chain-node:hover { background: rgba(255,255,255,0.05); }
  .chain-arrow { color: var(--text-muted); font-size: 10px; margin: 0 4px; }
  
  .controls { position: absolute; bottom: 16px; right: 16px; display: flex; gap: 6px; z-index: 10; }
  .ctrl-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--card); color: var(--text); cursor: pointer; font-size: 12px; }
  .ctrl-btn:hover { background: rgba(255,255,255,0.08); }
</style>
</head>
<body>
<div id="container">
  <div id="sidebar">
    <h1> Agent Dependency Graph</h1>
    <div class="subtitle">${nodes.length} agents · ${edges.length} dependencies · Interactive</div>
    
    <input id="search" type="text" placeholder="Search agent...">
    
    <div class="section-title">Main Execution Chain</div>
    <div id="main-chain"></div>
    
    <div class="section-title">Filter by Stage</div>
    <div class="stage-filter" id="stageFilters"></div>
    
    <div class="section-title">Legend</div>
    <div id="legend"></div>
    
    <div id="stats">
      <div>Nodes: <span id="statNodes">${nodes.length}</span></div>
      <div>Edges: <span>${edges.length}</span></div>
      <div>Visible: <span id="statVisible">${nodes.length}</span></div>
    </div>
  </div>
  
  <div id="graph">
    <div id="tooltip"></div>
    <div class="controls">
      <button class="ctrl-btn" onclick="resetZoom()">Reset</button>
      <button class="ctrl-btn" onclick="centerGraph()">Center</button>
      <button class="ctrl-btn" onclick="toggleLabels()">Labels</button>
    </div>
  </div>
</div>

<script>
const nodesData = ${nodesJson};
const edgesData = ${edgesJson};
const stageColors = ${stageColorsJson};
const stageOrder = ${stageOrderJson};

// ─── Build legend ──────────────────────────────────────────────────────
const legend = document.getElementById('legend');
for (const stage of stageOrder) {
  if (!stageColors[stage]) continue;
  const item = document.createElement('div');
  item.className = 'legend-item';
  const dot = document.createElement('div');
  dot.className = 'legend-dot';
  dot.style.background = stageColors[stage];
  const label = document.createElement('span');
  label.textContent = stage.charAt(0).toUpperCase() + stage.slice(1);
  item.appendChild(dot);
  item.appendChild(label);
  legend.appendChild(item);
}

// ─── Build stage filters ───────────────────────────────────────────────
const filters = document.getElementById('stageFilters');
const allBtn = document.createElement('button');
allBtn.className = 'stage-btn active';
allBtn.textContent = 'All';
allBtn.dataset.stage = 'all';
filters.appendChild(allBtn);

for (const stage of stageOrder) {
  const count = nodesData.filter(n => n.stage === stage).length;
  if (count === 0) continue;
  const btn = document.createElement('button');
  btn.className = 'stage-btn';
  btn.textContent = stage + ' (' + count + ')';
  btn.dataset.stage = stage;
  btn.style.borderColor = stageColors[stage] || 'var(--border)';
  filters.appendChild(btn);
}

// ─── Build main chain ──────────────────────────────────────────────────
const chain = document.getElementById('main-chain');
const chainKeys = ['DecisionAgent', 'PlaywrightExecutionEngine', 'ExecutionAgent',
  'failureAnalysisAgent', 'RCAAgent', 'locatorHealingAgent', 'ReportAgent'];
const chainData = chainKeys.map(k => nodesData.find(n => n.id === k)).filter(Boolean);
for (let i = 0; i < chainData.length; i++) {
  const node = chainData[i];
  const div = document.createElement('div');
  div.className = 'chain-node';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + (stageColors[node.stage] || '#8b949e');
  const name = document.createElement('span');
  name.textContent = node.name || node.id;
  div.appendChild(dot);
  div.appendChild(name);
  chain.appendChild(div);
  if (i < chainData.length - 1) {
    const arrow = document.createElement('div');
    arrow.className = 'chain-arrow';
    arrow.textContent = '▼';
    chain.appendChild(arrow);
  }
}

// ─── D3 Graph ──────────────────────────────────────────────────────────
const width = document.getElementById('graph').clientWidth;
const height = document.getElementById('graph').clientHeight;

const svg = d3.select('#graph').append('svg')
  .attr('width', width)
  .attr('height', height);

const g = svg.append('g');

// Zoom
const zoom = d3.zoom()
  .scaleExtent([0.2, 4])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
  });
svg.call(zoom);

// Arrow markers
svg.append('defs').selectAll('marker')
  .data(['arrow']).enter().append('marker')
  .attr('id', 'arrow')
  .attr('viewBox', '0 -5 10 10')
  .attr('refX', 20)
  .attr('refY', 0)
  .attr('markerWidth', 6)
  .attr('markerHeight', 6)
  .attr('orient', 'auto')
  .append('path')
  .attr('d', 'M0,-5L10,0L0,5')
  .attr('fill', '#8b949e');

// Build node map
const nodeMap = {};
nodesData.forEach(n => { nodeMap[n.id] = n; });

// Filter active agents
let activeStages = new Set();
let searchQuery = '';

function getVisibleNodes() {
  return nodesData.filter(n => {
    if (activeStages.size > 0 && !activeStages.has(n.stage)) return false;
    if (searchQuery && !n.id.toLowerCase().includes(searchQuery) &&
        !(n.name || '').toLowerCase().includes(searchQuery)) return false;
    return true;
  });
}

function getVisibleEdges(visibleNodes) {
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  return edgesData.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
}

// Force simulation
let simulation;
let link;
let node;

function render() {
  const visibleNodes = getVisibleNodes();
  const visibleEdges = getVisibleEdges(visibleNodes);
  
  document.getElementById('statVisible').textContent = visibleNodes.length;

  // Clear
  g.selectAll('*').remove();

  // Links
  link = g.append('g')
    .selectAll('line')
    .data(visibleEdges)
    .join('line')
    .attr('stroke', '#8b949e')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow)');

  // Nodes
  node = g.append('g')
    .selectAll('g')
    .data(visibleNodes)
    .join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded));

  // Node circles
  node.append('circle')
    .attr('r', d => Math.max(6, Math.min(18, 18 - (d.priority || 50) / 10)))
    .attr('fill', d => stageColors[d.stage] || '#8b949e')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1)
    .attr('opacity', 0.9);

  // Node labels
  node.append('text')
    .text(d => d.name || d.id)
    .attr('x', d => Math.max(6, Math.min(18, 18 - (d.priority || 50) / 10)) + 8)
    .attr('y', 4)
    .attr('fill', '#c9d1d9')
    .attr('font-size', '11px')
    .attr('font-family', 'sans-serif')
    .style('pointer-events', 'none');

  // Tooltip events
  node.on('mouseenter', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseleave', hideTooltip)
    .on('click', (event, d) => {
      // Focus on clicked node
      const transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(1.5);
      svg.transition().duration(750).call(zoom.transform, transform);
    });

  // Simulation
  if (simulation) simulation.stop();

  simulation = d3.forceSimulation(visibleNodes)
    .force('link', d3.forceLink(visibleEdges).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(30))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    });
}

// ─── Tooltip ───────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');

function showTooltip(event, d) {
  const deps = edgesData.filter(e => e.source === d.id).map(e => nodeMap[e.target]);
  const dependents = edgesData.filter(e => e.target === d.id).map(e => nodeMap[e.source]);
  
  let html = '<div class="tt-name" style="color:' + (stageColors[d.stage] || '#8b949e') + '">' + (d.name || d.id) + '</div>';
  html += '<div class="tt-detail">ID: ' + d.id + '</div>';
  html += '<div class="tt-detail">Stage: ' + d.stage + '</div>';
  html += '<div class="tt-detail">Priority: ' + d.priority + '</div>';
  if (d.description) html += '<div class="tt-detail">' + d.description.substring(0, 100) + '</div>';
  
  if (deps.length > 0) {
    html += '<div class="tt-deps"><strong>Depends on:</strong><br>';
    deps.forEach(dep => {
      html += '<span style="color:' + (stageColors[dep.stage] || '#8b949e') + ';">' + (dep.name || dep.id) + '</span> (' + dep.stage + ')<br>';
    });
    html += '</div>';
  }
  if (dependents.length > 0) {
    html += '<div class="tt-deps"><strong>Required by:</strong><br>';
    dependents.forEach(dep => {
      html += '<span style="color:' + (stageColors[dep.stage] || '#8b949e') + ';">' + (dep.name || dep.id) + '</span> (' + dep.stage + ')<br>';
    });
    html += '</div>';
  }
  
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
}

function moveTooltip(event) {
  const graphRect = document.getElementById('graph').getBoundingClientRect();
  let x = event.clientX - graphRect.left + 12;
  let y = event.clientY - graphRect.top - 10;
  if (x + 320 > graphRect.width) x = event.clientX - graphRect.left - 330;
  if (y < 0) y = 10;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// ─── Drag ──────────────────────────────────────────────────────────────
function dragStarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// ─── Controls ──────────────────────────────────────────────────────────
function resetZoom() {
  svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}

function centerGraph() {
  const visible = getVisibleNodes();
  if (visible.length === 0) return;
  const cx = d3.mean(visible, d => d.x || width / 2);
  const cy = d3.mean(visible, d => d.y || height / 2);
  svg.transition().duration(750).call(zoom.transform,
    d3.zoomIdentity.translate(width / 2 - cx, height / 2 - cy));
}

let labelsVisible = true;
function toggleLabels() {
  labelsVisible = !labelsVisible;
  g.selectAll('text').attr('display', labelsVisible ? 'block' : 'none');
}

// ─── Filter handlers ───────────────────────────────────────────────────
document.querySelectorAll('.stage-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const stage = btn.dataset.stage;
    if (stage === 'all') {
      document.querySelectorAll('.stage-btn').forEach(b => {
        if (b.dataset.stage !== 'all') b.classList.remove('active');
      });
      activeStages = new Set();
    } else {
      document.querySelector('.stage-btn[data-stage="all"]').classList.remove('active');
      if (btn.classList.contains('active')) {
        activeStages.add(stage);
      } else {
        activeStages.delete(stage);
      }
      if (activeStages.size === 0) {
        document.querySelector('.stage-btn[data-stage="all"]').classList.add('active');
      }
    }
    render();
  });
});

// ─── Search ────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase();
  render();
});

// ─── Initial render ────────────────────────────────────────────────────
render();

// ─── Resize handler ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = document.getElementById('graph').clientWidth;
  const h = document.getElementById('graph').clientHeight;
  svg.attr('width', w).attr('height', h);
  if (simulation) simulation.force('center', d3.forceCenter(w / 2, h / 2));
});
</script>
</body>
</html>`;

  fs.ensureDirSync(path.dirname(OUTPUT));
  fs.writeFileSync(OUTPUT, html, 'utf8');
  return OUTPUT;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     MAIN                                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

async function main() {
  // Discover all agents
  const registry = require('../ai/core/AgentRegistry');
  await registry.discover();
  
  const data = loadAgents();
  const outputPath = generateHTML(data);
  
  const stats = fs.statSync(outputPath);
  console.log('[AgentDependencyGraph] Generated: ' + outputPath);
  console.log('[AgentDependencyGraph] Size: ' + stats.size + ' bytes');
  console.log('[AgentDependencyGraph] Nodes: ' + data.nodes.length + ' agents');
  console.log('[AgentDependencyGraph] Edges: ' + data.edges.length + ' dependencies');
  console.log('[AgentDependencyGraph] Done.');
}

main().catch(err => {
  console.error('[AgentDependencyGraph] Fatal:', err.message);
  process.exit(1);
});
