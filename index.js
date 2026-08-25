document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('tools-grid');
  const searchInput = document.getElementById('search-input');
  let loadedTools = [];

  async function init() {
    try {
      const resList = await fetch('./tools.json');
      const toolFolderNames = await resList.json();

      const fetchPromises = toolFolderNames.map(async (folder) => {
        const res = await fetch(`./tools/${folder}/${folder}.json`);
        const data = await res.json();
        return {
          ...data,
          image: `./tools/${folder}/${data.image}`,
          url: `./tools/${folder}/${data.url}`
        };
      });

      loadedTools = await Promise.all(fetchPromises);
      renderTools(loadedTools);
    } catch (error) {
      grid.innerHTML = `<p style="color: #ef4444; grid-column: 1/-1; text-align: center;">Error al cargar las herramientas.</p>`;
    }
  }

  function renderTools(items) {
    if (items.length === 0) {
      grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No se encontraron herramientas.</p>`;
      return;
    }

    grid.innerHTML = items.map(tool => `
      <a href="${tool.url}" class="tool-card">
        <div class="tool-cover-container">
          <img src="${tool.image}" alt="${tool.name}" class="tool-cover" />
        </div>
        <div class="tool-content">
          <h2 class="tool-title">${tool.name}</h2>
          <p class="tool-desc">${tool.description}</p>
        </div>
      </a>
    `).join('');
  }

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = loadedTools.filter(tool => 
      tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query)
    );
    renderTools(filtered);
  });

  init();
});