# ScriptZ 0.1

**Estudio de escritura de guiones gratuito, sin suscripciones ni funciones bloqueadas.**
Cine, series, multicámara, teatro, radio/podcast, cómic y guion audiovisual a dos columnas.
Funciona sin conexión, en Windows, macOS, Linux, el navegador y como app instalable (PWA).

---

## Qué incluye

| Área | Funciones |
|---|---|
| **Editor** | Página real WYSIWYG con saltos, (MÁS)/(CONT.) y numeración en vivo · Tab/Enter configurables por elemento · Autocompletado de personajes, locaciones, momentos y transiciones · Macros · Diálogo dual · Marcadores · Resaltador · Comentarios con @menciones y respuestas · Buscar y reemplazar (mayúsculas, palabra completa, regex, por elemento o personaje) · Zoom, modo foco, máquina de escribir, pantalla completa · Dictado por voz |
| **Formatos** | 7 plantillas (largometraje, serie, multicámara, teatro, audio, cómic, AV) · Convenciones en/es-LA/es-ES/pt-BR · Editor de estilos por elemento · Encabezados y pies con variables · Portada · Carta y A4 · Marca de agua |
| **Revisiones** | Modo revisión con asteriscos y colores de industria · Numeración de escenas bloqueada (5A, A1, OMITIDA) · Páginas bloqueadas (12A) · Versiones guardadas · Comparador de versiones con informe · Copias automáticas cada 10 minutos |
| **Intercambio** | Importa y exporta Final Draft (.fdx), Fountain, Word (.docx). Importa PDF, Fade In (.fadein), Celtx, Highland y WriterDuet. Exporta PDF (fuentes incrustadas, Unicode), EPUB, HTML, Markdown y texto. También imprime |
| **Historia** | Tarjetas reordenables y pizarra libre con ideas · Estructuras (Salva al gato, Viaje del héroe, 3 y 7 actos, Círculo de Harmon, Kishōtenketsu) con regla de páginas · Línea de tiempo cronológica vs. guion · Personajes con perfil y arco emocional · Locaciones |
| **Estadísticas** | Duración estimada · Balance acción/diálogo · INT/EXT y día/noche · Personajes y escenas · Metas diarias, racha y calendario · Sprints · CSV |
| **Preproducción** | Etiquetado en el texto (16 categorías) · Hojas de desglose · Plan de rodaje con tiras de color y planificación automática · Hojas de llamado · Presupuesto con cargas e imprevistos |
| **Colaboración** | Edición en tiempo real con cursores (servidor propio incluido, sin dependencias) · Roles dueño/editor/lector · Enlace de lectura para el navegador · Sigue funcionando sin conexión y sincroniza al volver · Sincronización con carpetas de Google Drive, Dropbox u OneDrive |
| **Lectura** | Lectura en voz alta con voz por personaje y modo ensayo ("mi personaje") · Exportación a WAV (Windows) |
| **Interfaz** | Español, inglés y portugués · Temas claro, oscuro, sepia y noche · Paleta de comandos (Ctrl+K) · Atajos editables · Recorrido guiado · Aviso de actualizaciones |
| **IA (opcional)** | Apagada por defecto. Con tu propia clave de Anthropic o un modelo local (Ollama, LM Studio): resúmenes de escena, reescritura de una selección y preguntas sobre el guion |

## Empezar

### Versión de escritorio (instalador)
- **Windows:** ejecutá `CREAR_INSTALADOR_WINDOWS.bat`. El instalador queda en `DIST\`.
- **macOS / Linux:** `npm install && npm run desktop:build`.
- **Las tres plataformas a la vez:** subí el proyecto a GitHub y creá una etiqueta `v0.1.0`. El flujo `.github/workflows/release.yml` compila los instaladores y los adjunta a un *release* en borrador.

Requisitos para compilar: Node.js 20+, Rust y los [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/).

### Versión web / PWA
```bash
npm install
npm run dev        # http://127.0.0.1:1420
npm run build      # genera dist/ para publicar en cualquier hosting estático
```
En Windows también podés usar `INICIAR_VERSION_WEB.bat`. Publicada con HTTPS, ScriptZ se instala como app desde el navegador (también en celulares y tablets) y funciona sin conexión.

### Colaboración en tiempo real
```bash
npm run build:server               # solo si modificaste el código del servidor
node server/collab-server.mjs      # puerto 4735; opciones: --port --host --data --cert --key
```
En ScriptZ: **Colaboración → Empezar a compartir** y pasá la invitación. Más detalles en [docs/COLABORACION.md](docs/COLABORACION.md).

## Desarrollo

```bash
npm test           # paginación, Fountain/FDX/PDF, OT aleatorio y simulación de 3 clientes
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

```
src/
  core/       modelo, formatos, paginación, escenas, marcas, diff, revisiones, historia, producción
  editor/     motor de edición propio (contentEditable con modelo como fuente de verdad)
  io/         Fountain, FDX, DOCX, PDF (escritor propio con subconjunto TrueType), EPUB, HTML, importadores
  collab/     transformación operacional, cliente, servidor WebSocket sin dependencias
  views/      escribir, tarjetas, estructura, línea de tiempo, personajes, estadísticas, revisiones, producción, ajustes
  app/        estado, comandos, acciones, ajustes
  i18n/       español, inglés, portugués
src-tauri/    aplicación de escritorio (Rust): biblioteca local, copias, archivos vinculados, audio
server/       servidor de colaboración empaquetado en un solo archivo
tests/        pruebas automáticas
```

Documentación: [Guía de uso](docs/GUIA.md) · [Formatos](docs/FORMATOS.md) · [Colaboración](docs/COLABORACION.md) · [Limitaciones conocidas](docs/LIMITACIONES.md) · [Cambios](CHANGELOG.md)

## Licencia
MIT. Tipografías: Courier Prime y Hanken Grotesk (SIL OFL 1.1), Liberation Mono (SIL OFL 1.1) y DejaVu Sans Mono (licencia Bitstream Vera); ver `src/assets/fonts/`.
