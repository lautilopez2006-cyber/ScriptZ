# Cambios

## 0.1.1 — noviembre 2026

### Diseño nuevo
- Identidad visual propia basada en el oficio: portadas encuadernadas con broches de bronce, páginas de revisión de colores de la industria y el "lápiz azul" del editor.
- Courier Prime, la tipografía diseñada para guiones, en el editor y en el PDF. Tiene las mismas medidas que Courier, así que la paginación no cambia.
- Hanken Grotesk para la interfaz.
- Cada sección lleva el color de su página de revisión.
- Temas nuevos: Estudio (claro), Sala de proyección (oscuro), Archivo (sepia) y Medianoche.
- Animaciones:
  - Al abrir un guion, la portada se transforma en la página del editor.
  - El menú lateral se desliza entre secciones.
  - Las tarjetas se reparten como un mazo.
  - Las líneas de tiempo y el arco del personaje se dibujan.
  - Las estadísticas cuentan hasta su valor.
  - El recorrido guiado es un mazo de páginas de revisión.
- Se respeta "reducir movimiento" del sistema.
- Logo e íconos nuevos.

### Importación probada con archivos reales
- Fade In:
  - Acotaciones con paréntesis.
  - Mayúsculas de estilo.
  - Texto centrado.
  - Sin párrafos vacíos.
  - Coincide exactamente con Final Draft en 6 guiones de prueba.
- Celtx: portada y mayúsculas.
- Highland: paquetes TextBundle.
- Fountain: salto de página pegado al diálogo.
- Final Draft: párrafo vacío final.


## 0.1.0 — noviembre 2026

Reescritura completa sobre una base nueva. Los proyectos `.scriptz` de la 0.0.x se abren y se migran solos.

### Editor
- Motor de edición propio: el modelo del guion es la fuente de verdad. Pegar, deshacer y la escritura con IME son estables, y escribir cuesta unos 8 ms por tecla en un guion de 217 páginas.
- Paginación en vivo idéntica al PDF: (MÁS)/(CONT.), escenas que no se cortan mal, actos en página nueva y CONT. automático.
- 21 tipos de elemento.
- Tab/Enter configurables y autocompletado inteligente.
- Macros, diálogo dual, marcadores, resaltador de colores y comentarios con respuestas y @menciones.
- Buscar y reemplazar avanzado.
- Zoom, modo foco, máquina de escribir, pantalla completa y dictado.

### Formatos
- Plantillas: largometraje, serie, multicámara, teatro, audio, cómic y AV a dos columnas.
- Convenciones de inglés, español latinoamericano, español de España y portugués de Brasil.
- Editor de estilos por elemento.
- Encabezados y pies con variables, portada, carta/A4 y marca de agua.

### Revisiones
- Revisiones de color con asteriscos en el margen. La primera revisión es azul, como en la industria.
- Numeración bloqueada (5A, A1, OMITIDA) y páginas A/B.
- Versiones con nombre, comparador con informe exportable y copias automáticas.

### Intercambio
- Final Draft y Fountain de ida y vuelta, sin pérdidas en las pruebas.
- Word (.docx) con estilos propios o maquetación exacta.
- PDF con escritor propio: fuentes incrustadas, acentos, ñ, griego y cirílico, marca de agua y marcadores. Genera 217 páginas en menos de un segundo.
- Importa PDF, Fade In, Celtx, Highland y WriterDuet.
- Exporta EPUB, HTML, Markdown y texto.

### Historia, estadísticas y preproducción
- Tarjetas, pizarra libre, estructuras con regla de páginas, línea de tiempo, personajes con arco y locaciones.
- Estadísticas completas, metas, racha, calendario y sprints.
- Etiquetado, desglose, plan de rodaje con planificación automática, hojas de llamado y presupuesto.

### Colaboración
- Edición en tiempo real con cursores, roles y enlace de lectura.
- Servidor propio en un único archivo, sin dependencias.
- Resolución de conflictos verificada con 15.000 casos aleatorios y una simulación de tres clientes con red desordenada.
- Sincronización con carpetas de Drive/Dropbox/OneDrive.

### Plataformas e interfaz
- Windows, macOS y Linux (instaladores vía CI), web y PWA sin conexión.
- Español, inglés y portugués, cuatro temas, paleta de comandos, atajos editables, recorrido guiado y aviso de actualizaciones.

### IA opcional
- Apagada por defecto. Usa tu clave o un modelo local.
