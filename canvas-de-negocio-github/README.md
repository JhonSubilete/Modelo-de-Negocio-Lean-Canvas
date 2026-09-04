# Canvas de Negocio

Generador de Business Model Canvas en español, listo para GitHub Pages. Funciona sin servidor, base de datos ni dependencias externas de JavaScript.

## Funciones

- Nueve bloques editables del Business Model Canvas.
- Notas que pueden arrastrarse entre bloques.
- Alternativa táctil para mover notas desde celulares y tabletas.
- Guardado automático en el navegador.
- Carga local de logotipo de hasta 2 MB.
- Modo color y monocromo.
- Importación y exportación del proyecto en JSON.
- Exportación a PDF mediante el diálogo de impresión.
- Diseño responsive y navegación accesible por teclado.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube todo el contenido de esta carpeta a la rama `main`.
3. Abre **Settings → Pages**.
4. En **Build and deployment → Source**, selecciona **GitHub Actions**.
5. Abre la pestaña **Actions** y espera a que termine el flujo “Publicar en GitHub Pages”.

La URL aparecerá en el resumen de la ejecución. Los cambios posteriores que envíes a `main` se publicarán automáticamente.

## Uso local

Abre `dist/index.html` en un navegador moderno. Para evitar restricciones de archivos locales, también puedes servir la carpeta `dist` con cualquier servidor HTTP estático.

## Estructura

```text
dist/
  index.html
  styles.css
  script.js
.github/workflows/deploy-pages.yml
README.md
```

## Privacidad

El contenido del lienzo y el logotipo permanecen en el almacenamiento local del navegador. No se transmiten a ningún servicio externo.

## Licencia del lienzo

La estructura del Business Model Canvas se atribuye a Alexander Osterwalder e Yves Pigneur y se distribuye bajo licencia CC BY-SA 3.0. Revisa sus condiciones si redistribuyes una versión modificada.
