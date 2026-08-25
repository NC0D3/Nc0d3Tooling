document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('tools-grid');
  const searchInput = document.getElementById('search-input');
  let tools = [];

  async function loadTools() {
    try {
      const response = await fetch('./tools.json');
      tools = await response.json();
      renderTools(tools);
    } catch (error) {
      grid.innerHTML = `<p style="color: #ef4444;">Error cargando herramientas.</p>`;
    }
  }

  function renderTools(items) {
    if (items.length === 0) {
      grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No se encontraron herramientas.</p>`;
      return;
    }

    grid.innerHTML = items.map(tool => `
      <a href="${tool.url}" class="tool-card">
        <div class="tool-header">
          <img src="${tool.icon}" alt="${tool.name}" class="tool-icon" />
          <h2 class="tool-title">${tool.name}</h2>
        </div>
        <p class="tool-desc">${tool.description}</p>
        <div class="tool-footer">
          <div class="tags">
            ${tool.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
          </div>
          <div class="gooey-wrapper">
            <span class="gooey-btn">Abrir →</span>
          </div>
        </div>
      </a>
    `).join('');
  }

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = tools.filter(tool => 
      tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      tool.tags.some(tag => tag.toLowerCase().includes(query))
    );
    renderTools(filtered);
  });

  loadTools();
});