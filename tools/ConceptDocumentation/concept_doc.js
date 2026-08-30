document.addEventListener('DOMContentLoaded', () => {
    
    // Configuración de los campos de texto
    const textFields = [
        { id: 'field-resumen', label: 'Resumen', default: 'Un generador de datos aleatorios, ficticios e inexistentes...' },
        { id: 'field-desc', label: 'Descripción General', default: 'Me gustaria generar un aplicativo que permitiera generar informacion logica aleatoria...' },
        { id: 'field-func', label: 'Funcionamiento Esperado', default: 'Espero que sea una especie de chat...' },
        { id: 'field-tech', label: 'Tecnologías Posibles', default: '*Inserta tu Tecnologías o metodologías que podrían utilizarse aqui*' },
        { id: 'field-fund', label: 'Fundamentos o Principios', default: '*Inserta tu Conceptos físicos, matemáticos, electrónicos, mecánicos, químicos, etc. aqui*' },
        { id: 'field-obs', label: 'Observaciones', default: '*Inserta tu Información adicional aqui*' }
    ];

    const container = document.getElementById('text-fields-container');

    // Construir campos de texto dinámicamente con barra de herramientas
    textFields.forEach(field => {
        const group = document.createElement('div');
        group.className = 'input-group';
        group.innerHTML = `
            <label>${field.label}</label>
            <div class="rt-toolbar">
                <button type="button" class="rt-btn" onclick="formatText('${field.id}', '## ', '')">H2</button>
                <button type="button" class="rt-btn" onclick="formatText('${field.id}', '**', '**')"><b>B</b></button>
                <button type="button" class="rt-btn" onclick="insertLink('${field.id}')">🔗 Link</button>
            </div>
            <textarea id="${field.id}" placeholder="${field.default}"></textarea>
        `;
        container.appendChild(group);
    });

    // Estado para las imágenes (Base64)
    let imagesData = [];
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const gallery = document.getElementById('gallery');

    // ----- Lógica de Formateo de Texto (Accesible globalmente) -----
    window.formatText = (id, prefix, suffix) => {
        const textarea = document.getElementById(id);
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        
        const replacement = prefix + selected + suffix;
        textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
        textarea.focus();
        textarea.selectionStart = start + prefix.length;
        textarea.selectionEnd = end + prefix.length;
    };

    window.insertLink = (id) => {
        const url = prompt('Introduce la URL:');
        if (!url) return;
        const name = prompt('Introduce el texto del enlace:', 'Enlace');
        if (!name) return;
        
        const textarea = document.getElementById(id);
        const start = textarea.selectionStart;
        const replacement = `[${name}](${url})`;
        
        textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(textarea.selectionEnd);
        textarea.focus();
    };

    // ----- Lógica de Imágenes -----
    const addImage = (file) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            imagesData.push(base64);
            renderGallery();
        };
        reader.readAsDataURL(file);
    };

    const renderGallery = () => {
        gallery.innerHTML = '';
        imagesData.forEach((src, index) => {
            const wrap = document.createElement('div');
            wrap.className = 'img-wrapper';
            wrap.innerHTML = `
                <img src="${src}" class="img-preview" />
                <button class="remove-img" data-index="${index}">X</button>
            `;
            gallery.appendChild(wrap);
        });

        // Eventos para eliminar imagen
        document.querySelectorAll('.remove-img').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-index');
                imagesData.splice(idx, 1);
                renderGallery();
            });
        });
    };

    // Eventos DropZone
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(addImage);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('active');
        Array.from(e.dataTransfer.files).forEach(addImage);
    });

    // Evento Portapapeles (Ctrl+V) Global para imágenes
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image/') === 0) {
                addImage(item.getAsFile());
            }
        }
    });

    // ----- Generadores de ID y Fechas -----
    const getYYYYMMDD = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    };

    const generate8Rand = () => {
        const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const randomValues = new Uint32Array(8);
        window.crypto.getRandomValues(randomValues);
        return Array.from(randomValues).map(n => CHARSET[n % CHARSET.length]).join('');
    };

    // ----- Compilar Documento y Descargar -----
    document.getElementById('generate-btn').addEventListener('click', () => {
        const date = getYYYYMMDD();
        const rand8 = generate8Rand();
        const docCode = `${date}_${rand8}_ConceptDocumentation`;
        
        // UUID compatible con navegadores modernos
        const docId = crypto.randomUUID(); 
        
        // Obtener valores
        const authorId = document.getElementById('field-author').value || '0000000000';
        const title = document.getElementById('field-title').value || 'Documento Sin Titulo';
        
        const getVal = (id, def) => {
            const val = document.getElementById(id).value.trim();
            return val ? val : def;
        };

        // Procesar las imágenes en su formato HTML específico
        let evidenciaVisualHTML = '*Inserta tus imagenes aqui*';
        if (imagesData.length > 0) {
            evidenciaVisualHTML = imagesData.map((b64, i) => {
                const imgId = `evidencia_${String(i+1).padStart(3, '0')}`;
                return `<p align='center' id='${imgId}'>\n  <img \n  id='${imgId}'\n  alt='' src='${b64}'>\n</p>`;
            }).join('\n\n');
        }

        // Construir el Markdown String
        const mdContent = `---
document_type: ConceptDocumentation
document_stage: proposal

document_code: ${docCode}
document_id: ${docId}

author_id: ${authorId}
creation_date: ${date}
title: ${title}
---

# Resumen
${getVal('field-resumen', textFields[0].default)}

# Descripción General
${getVal('field-desc', textFields[1].default)}

# Funcionamiento Esperado
${getVal('field-func', textFields[2].default)}

# Tecnologías Posibles
${getVal('field-tech', textFields[3].default)}

# Fundamentos o Principios
${getVal('field-fund', textFields[4].default)}

# Evidencia Visual
${evidenciaVisualHTML}

# Observaciones
${getVal('field-obs', textFields[5].default)}
`;

        // Descargar Archivo
        const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docCode}.md`;
        document.body.appendChild(a);
        a.click();
        
        // Limpieza
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });
});