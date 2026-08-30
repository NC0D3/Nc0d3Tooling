document.addEventListener('DOMContentLoaded', () => {
    const lengthSlider = document.getElementById('length-slider');
    const lengthNumber = document.getElementById('length-number');
    const generateBtn = document.getElementById('generate-btn');
    const resultBox = document.getElementById('result-box');
    const copyBtn = document.getElementById('copy-btn');
    const copyText = document.getElementById('copy-text');

    // Diccionario Alfanumérico Mayúsculas
    const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    // Sincronización entre el slider y el input number
    lengthSlider.addEventListener('input', (e) => {
        lengthNumber.value = e.target.value;
    });

    lengthNumber.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (val < 1) val = 1;
        if (val > 10) val = 10;
        
        if (!isNaN(val)) {
            lengthSlider.value = val;
        }
    });

    lengthNumber.addEventListener('blur', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 10) val = 10;
        e.target.value = val;
        lengthSlider.value = val;
    });

    // Función principal para generar el string seguro
    const generateString = (length) => {
        let result = '';
        const randomValues = new Uint32Array(length);
        window.crypto.getRandomValues(randomValues);

        for (let i = 0; i < length; i++) {
            const randomIndex = randomValues[i] % CHARSET.length;
            result += CHARSET[randomIndex];
        }
        return result;
    };

    // Handler del botón Generar
    generateBtn.addEventListener('click', () => {
        const length = parseInt(lengthNumber.value, 10);
        resultBox.value = generateString(length);
        
        // Efecto visual rápido
        resultBox.style.borderColor = 'var(--verde-esmeralda-glow)';
        setTimeout(() => {
            resultBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        }, 200);
    });

    // Handler del botón Copiar (mismo estilo que img2uri)
    copyBtn.addEventListener('click', () => {
        const val = resultBox.value;
        if (!val) return;

        navigator.clipboard.writeText(val).then(() => {
            // Cambio visual a estado "Copiado"
            copyText.textContent = '¡Copiado!';
            copyBtn.style.background = 'var(--verde-esmeralda)';
            copyBtn.style.color = 'var(--verde-botella)';
            
            // Restaurar estado
            setTimeout(() => {
                copyText.textContent = 'Copiar';
                copyBtn.style.background = 'rgba(0,0,0,0.2)';
                copyBtn.style.color = 'var(--verde-esmeralda)';
            }, 2000);
        }).catch((err) => {
            console.error('Error al copiar: ', err);
            resultBox.value = 'Error de portapapeles';
        });
    });

    // Auto-generar uno al cargar
    generateBtn.click();
});