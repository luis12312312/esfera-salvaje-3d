# Esfera Salvaje 3D — Luz entre los árboles

Juego de crecimiento y supervivencia en un bosque 3D. La edición gráfica 03 añade reflejos del escenario en el agua, orillas con espuma y cáusticas, amanecer, atardecer y noche con estrellas y luciérnagas. La hierba se aparta al pasar, la esfera parpadea y reacciona a los depredadores, y aparecen ondas al aterrizar o subir de nivel y una estela al acelerar.

**[Jugar online](https://luis12312312.github.io/esfera-salvaje-3d/)** · **[Despliegues](https://github.com/luis12312312/esfera-salvaje-3d/actions/workflows/pages.yml)**

En **Opciones → Luz del bosque**, elige el claro del alba, la hora dorada o la noche de luciérnagas. El **Ciclo vivo** recorre los tres ambientes en seis minutos y se detiene al pausar. Los cambios de ambiente se funden suavemente. El menú comienza en la hora dorada.

## Jugar

Abre **Esfera Salvaje 3D.html** en Chrome, Edge o Firefox. Todos los recursos están incluidos; no necesita conexión a internet. Mantén el HTML junto a `forest.css`, `forest-graphics.js`, `forest-atmosphere.js` y la carpeta `vendor`.

También puedes iniciar un servidor local con Node.js:

```sh
npm start
```

Abre <http://127.0.0.1:4173>.

## Controles

| Acción | PC | Celular |
|---|---|---|
| Mover | WASD o flechas | Joystick |
| Girar cámara | Arrastrar o Q/E | Arrastrar |
| Zoom | Rueda | — |
| Saltar | Espacio | SALTAR |
| Impulso | Shift, consume masa | IMPULSO |
| Pausar | Esc o botón de pausa | Botón de pausa |

Consume objetos y esferas de menor tamaño. Los depredadores grandes pueden devorarte. El diámetro y la cámara crecen suavemente con la masa.

En **Opciones**, el modo automático reduce la calidad si el rendimiento baja. Los modos manuales permanecen seleccionados. BAJA desactiva sombras dinámicas y postprocesamiento; ALTA y ULTRA añaden rayos de luz, más vegetación, sombras de mayor resolución y reflejos del escenario en el agua. Los reflejos usan una resolución menor y en ALTA se actualizan un fotograma de cada dos. MEDIA y BAJA conservan agua animada sin volver a dibujar el escenario reflejado. Puedes desactivar el movimiento adicional de cámara y el sonido. La partida se pausa al cambiar de pestaña.

## Verificar

```sh
npm install
npm test
```

Las pruebas usan una instalación local de Chrome o Edge en Windows y Playwright Core. Puedes especificar otro ejecutable con `CHROME_PATH`. Comprueban renderizado sin errores JavaScript/WebGL, movimiento, comida, salto, efectos de aterrizaje, estela de impulso, pausa, calidad gráfica, reinicio, derrota, reintento, noche, reflejos, ciclo de iluminación y controles móviles emulados. Las capturas se guardan en `artifacts/`.

## Publicar

```sh
npm run build
npm run preview
```

El build valida JavaScript y referencias locales y genera `dist/index.html`. Incluye únicamente el juego, las hojas de estilo, los scripts gráficos y Three.js con su licencia. No necesita instalar dependencias para compilar. Las rutas relativas funcionan bajo el subdirectorio del proyecto en GitHub Pages.

Cada push a `main` ejecuta `.github/workflows/pages.yml` y publica `dist/` en GitHub Pages. También puede ejecutarse desde Actions → Publicar Esfera Salvaje → Run workflow. En Settings → Pages, el origen debe ser **GitHub Actions**. No se necesitan claves ni secretos de despliegue.

## Archivos

- `Esfera Salvaje 3D.html`: mundo, física, inteligencia artificial y audio.
- `forest-graphics.js`: arte procedural, materiales, ambiente y efectos gráficos.
- `forest-atmosphere.js`: ciclo de luz, cielo, reflejos, luciérnagas y efectos del personaje.
- `forest.css`: interfaz adaptable a PC y celular.
- `vendor/three.min.js`: Three.js r128, licencia MIT.
- `backup/Esfera Salvaje 3D.html`: versión original, sin modificaciones.
- `backup/edition02/`: copia de la edición gráfica anterior, con sus recursos.

La calidad y velocidad dependen de la GPU y de la resolución. Los controles móviles se verifican mediante emulación; no se ha probado en hardware móvil físico.
