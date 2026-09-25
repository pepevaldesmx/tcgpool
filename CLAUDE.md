# TCG Pool — contexto del proyecto

## Qué es y por qué

Comparador/buscador de cartas TCG enfocado a tiendas
mexicanas (LGS). Hoy, un jugador que busca una carta tiene que entrar tienda por
tienda (cada buscador ve sólo su propio inventario), hojear carpetas en una
convención, o preguntar en el chat de una tienda a ver si alguien contesta.

**El problema principal no es comparar precio: es que el stock de cualquier
tienda o vendedor individual, por sí solo, es demasiado bajo.** Nadie agrega la
oferta dispersa de varias tiendas en un solo lugar buscable. La comparación de
precio es real (los precios entre tiendas mexicanas no son copy-paste de
TCGPlayer, hay variación) pero es secundaria a la disponibilidad.

No hay competidor real. El único que lo intenta (TCGmercado) es una landing
vacía sin listings. Varias tiendas (MTG Wolf, Yellow Rabbit, MTG México, Tao
Games) tienen buscador de decklist, pero nunca cruzan con otras tiendas.

**Criterio de éxito de la demo:** pararse frente a un dueño de tienda, buscar
una carta que sabemos repartida entre 2–3 tiendas mexicanas, y que salga en
segundos algo que él no puede ver hoy en ningún lado.

## Cómo funciona el mercado (y por qué el producto es así)

Las cartas vienen en sobres. Una tienda compra sobres, los abre, y vende lo que
salió. **No puede conseguir una carta porque alguien la quiera** — su inventario
es el azar de lo que abrió, más lo que le compra a sus clientes.

De ahí sale todo lo demás. Que ninguna tienda tenga lo que buscas no es una
falla: es el estado normal. Y la oferta que falta no está en las tiendas, está
en las cajas de los jugadores que abrieron sobres hace años. Por eso los
afiliados no son un extra: son la respuesta al problema que el producto existe
para resolver.

Consecuencia práctica: una señal de "esto lo buscan y nadie lo tiene" NO le
sirve a una tienda para reabastecerse, porque no puede. Sirve para saber qué
comprarle a un cliente que llega a vender.

## Los tres roles

**Usuario** busca cartas y arma comandas. **Tienda** vende su inventario y avala
afiliados. **Afiliado** vende el suyo a través de una tienda: su stock suma al
de ella, la tienda NO cobra comisión de lo que él venda, y responde por él. La
tienda gana inventario, visitas cuando alguien recoge, y puede condicionar la
afiliación a que le compre sobres.

Los roles son RELACIONES (`memberships`), no un campo del usuario: el dueño de
una tienda también compra cartas.

## La comanda

Buscar una lista crea una **comanda**: el grupo de cartas que el usuario va a
comprar, armado desde la menor cantidad de fuentes posibles. El usuario puede
cambiar las fuentes. Lo que no se consigue cae en su **wishlist**, que vive por
su cuenta —se alimenta de búsquedas sueltas y de pendientes de varias comandas—
y avisa por correo UNA vez cuando aparece cualquier impresión de esa carta.

Al pagar se revisa carta por carta. Si alguien se la ganó en ese instante, se
busca otra fuente y **se le enseña el cambio al usuario antes de cobrar**: el
precio y hasta el costo de recolección se mueven. Si no hay otra fuente, esa
carta se va a la wishlist y no se cobra. No se aparta inventario: la regla de
"rearmar y avisar" cubre el caso sin bloquear stock de nadie.

## El dinero

Del **precio de las cartas** se restan la comisión de cobro y **2% + IVA (2.32%)
nuestro**; el resto se le paga a tiendas y afiliados. Ganamos 2%; el 0.32% es IVA
del SAT, no ingreso.

Envíos y consolidación se cobran **aparte y encima**, y su propia comisión de
terminal **sale del envío, no de la tienda**: el vendedor no cobró el envío, así
que descontarle su comisión le quitaría dinero por un servicio que no dio. El
resultado es que al vendedor le llega lo mismo sin importar cómo el comprador
eligió recibir su pedido, que es una decisión en la que él no tiene voz.

| Entrega (misma ciudad) | |
|---|---|
| Recoger en cada tienda | gratis |
| Consolidar en una tienda y recoger | $50 |
| A domicilio desde una tienda | $100 |
| Consolidar + domicilio | $150 |

Entre ciudades, $100 por cada ciudad de origen. La consolidación siempre se
cobra aparte.

**Los $50 sólo existen si hay lote.** Una corrida del mensajero junta VARIAS
comandas de las mismas tiendas; con una sola comanda, ésa paga la corrida
entera. Por eso la recolección va por días fijos y no "cuando el usuario pague":
el calendario es lo que fabrica la densidad. Y por eso concentrar la comanda en
pocas fuentes no era sólo comodidad del comprador — es la economía del
mensajero.

**Pagarle a un afiliado no es como pagarle a una tienda.** Son personas físicas:
retención de ISR e IVA y CFDI de por medio. Por eso `sellers` guarda RFC y
régimen fiscal.

## Sincronización: la elige el vendedor

No estudiamos cada tienda para ver cómo la conectamos: el vendedor elige su
método de un catálogo de conectores, y sumamos conectores conforme hagan falta.
Cuelgan de `sellers` y no de `stores`, porque un afiliado también tiene
inventario que sincronizar.

CSV no es la opción pobre, es el SUSTRATO: ManaBox y TCGplayer exportan CSV, así
que "sincronizar con ManaBox" es el importador con un preset de columnas, no un
conector nuevo.

Y la frescura del inventario es la cara visible del conector, lo que le da a la
tienda una razón propia para conectarse mejor: CSV manual = muchas comandas que
se rompen al pagar; feed cada 6 h = algunas; app conectada con webhooks = casi
ninguna.

## Alcance de arranque

**Sólo Magic y sólo CDMX.** Las tres tiendas del registro están en CDMX. La
lógica de envíos foráneos se modela igual aunque duerma. Expandir ciudades y
juegos viene después de entender esto.

## Fuera de alcance

App móvil nativa. Web responsive es suficiente.

## Invariantes técnicas

- **`card → printing → listing` son tres niveles distintos.** Una carta tiene
  muchas impresiones (set + número + idioma + foil); cada impresión, muchos
  listings de tiendas distintas. No los colapses.
- **Todo el SQL del catálogo vive en `src/lib/db/queries.ts`.** Las pantallas no
  hablan con Postgres directo.
- **El catálogo vive en Postgres, no en un archivo.** Fue SQLite reconstruido en
  cada build hasta que las tiendas empezaron a administrar su inventario,
  sincronizarse solas y manejar afiliados: todo eso son escrituras en runtime, y
  el filesystem de la función serverless es inmutable. Consecuencias que no hay
  que deshacer: el build ya no toca la base (`npm run build` es sólo
  `next build`), el cron escribe directo a Postgres y ya no commitea snapshots,
  y `data/snapshots/*.live.json` es evidencia de una corrida, no fuente de
  verdad.
- **Sin `DATABASE_URL` la app no inventa datos: lo dice.** El layout corta con
  `NotConfigured` en vez de dejar que cada página truene con un 500.
- **La ingesta escribe POR LOTES** (`upsertCards`, `upsertPrintings`,
  `upsertListings`). Una tienda real trae decenas de miles de listados: fila por
  fila serían cien mil viajes de red contra una base remota. Con SQLite local no
  importaba; aquí es la diferencia entre 19 segundos y media hora.
- **`listings.origin` separa lo que vino del feed de lo capturado a mano.** La
  sincronización sólo marca sin stock lo que tiene `origin = 'feed'`: si barriera
  todo, cada corrida borraría lo que la tienda capturó en su panel o lo que subió
  un afiliado.
- **La importación NO pisa lo que la tienda capturó a mano; levanta una
  advertencia.** Cuando el feed trae la misma impresión, en la misma condición,
  que un listado `origin='manual'` de esa tienda, ese renglón del feed NO entra
  a `listings` —entraría y la misma carta de la misma tienda saldría dos veces,
  con dos precios— y se guarda en `listing_conflicts`. La tienda decide caso por
  caso: `feed` copia los valores de Shopify al listado y lo devuelve al control
  de la importación; `manual` archiva la advertencia. Una advertencia ya resuelta
  no se reabre si el feed sigue diciendo lo mismo, pero sí si cambió: eso es una
  discrepancia nueva. La detección es `splitFeedByConflicts`, función pura sobre
  llaves, para poder probarla sin base.
- **El número de colección y el acabado NO son parte del nombre de la carta.**
  Las tiendas titulan "Command Tower (0233) (Surge Foil) [Marvel...]", y dejar
  cualquiera de esos paréntesis pegado al nombre convertía UNA carta en seis
  cartas distintas: el buscador la partía en pedazos y el cruce entre tiendas
  —la razón de existir del producto— dejaba de funcionar para ella. `parseTitle`
  pela los paréntesis del final uno por uno: número de colección a la impresión,
  tratamiento a la basura, y sólo lo que no reconoce se queda como nombre o set.
  Un paréntesis con puros dígitos NUNCA es el nombre del set. Arreglar el parser
  no basta: `pruneOrphans` corre en cada sincronización completa para que las
  cartas mal partidas de antes, que se quedan sin listados, salgan del catálogo.
  **Pero sólo borra las que no tienen `oracle_id`**: el catálogo sembrado son
  33,000 cartas sin listados A PROPÓSITO, y barrer por "sin listados" a secas lo
  borraba entero en cada corrida. Lo que hay que barrer es lo que Scryfall nunca
  reconoció, que es justo lo que inventó un parser malo.
- **`cards` es el catálogo de Magic COMPLETO, no el inventario.** Se siembra de
  los datos masivos de Scryfall (`npm run catalog:seed`, ~33,000 nombres) porque
  resolver nombres contra la red no escala: la ingesta pagaba 150 ms por nombre
  —diez minutos por tienda— y un CSV de mil renglones no cabría en una petición
  web. Con el catálogo sembrado se resuelve en memoria y sin red; Scryfall queda
  para lo que no está. Consecuencia que NO hay que deshacer: "N cartas" en la UI
  cuenta cartas que alguien vende, nunca filas de `cards`, y `searchCards`
  esconde las que nadie lista (el panel las pide con `includeUnlisted`, porque
  capturar lo que nadie tiene es justo su trabajo).
- **Quién es una carta lo decide el catálogo, no una lista de palabras.** Las
  tiendas cuelgan "(Pro Tour)", "(Promo Pack)", "(Oversized)" y lo que se les
  ocurra mañana; perseguirlas con un regex es una carrera perdida.
  `resolveAgainstCatalog` recorta paréntesis del final hasta que el catálogo
  reconoce el nombre, de la versión más larga a la más corta —"Erase (Not the
  Urza's Legacy One)" ES una carta y recortarla de más la cambiaría por otra— y
  si nada empata, no inventa.
- **Toda tienda sabe exportar un CSV; no toda tiene API.** El importador de
  `/tienda/<slug>` es el conector que no exige que la tienda corra nada en
  particular, y el único que desbloquea a las que no tienen feed. Se importa
  SIEMPRE en dos tiempos: primero se lee y se enseña qué se entendió —cuántas
  reconocidas, cuáles no— y sólo después se escribe. Importar mil renglones a
  ciegas y avisar del resultado es como una tienda pierde la confianza en un
  solo movimiento. Los nombres que no se reconocen se REPORTAN, nunca se
  adivinan. El CSV se lee con `parseCsv` y no con `split(",")`: los nombres de
  carta traen comas y comillas de verdad ("Jaya, Fiery Negotiator"), y partir
  por comas los convierte en basura silenciosa.
- **La búsqueda es `tsvector` con prefijo por palabra, y trigramas de respaldo.**
  `to_tsquery('simple', 'sol:* & ring:*')` reproduce lo que hacía FTS5; cuando no
  hay coincidencia, `pg_trgm` tolera errores de dedo ("counterspel" encuentra
  Counterspell). `match_key` se normaliza en JS para no depender de `unaccent`,
  que no todos los Postgres administrados traen. El respaldo difuso tiene PISO
  (0.55): con el umbral de fábrica, "counterspell" contestaba "Counterbalance"
  —otra carta, otro color, otro precio— presentada como si fuera la respuesta.
  Más vale no encontrar nada que contestar otra cosa. Y si nadie la tiene ahora,
  se dice: se repite la búsqueda incluyendo agotadas y se avisa, porque "estas
  tiendas la manejan pero está agotada" le sirve al comprador y "sin resultados"
  le hace creer que escribió mal el nombre.
- **Una fuente de datos = un adaptador** en `src/lib/ingest/adapters/`, que
  devuelve `RawListing[]`. Sumar una tienda Shopify no debe requerir código.
- **`npm run build` tiene que funcionar sin red y sin base.** El build no
  consulta Postgres; la ingesta resuelve nombres contra la caché versionada
  `data/scryfall-cache.json`.
- **Nunca presentes datos de muestra como reales, ni al revés.** La procedencia
  es POR TIENDA (`stores.data_source`, que la ingesta escribe con el origen real
  del feed, no con el modo del script). `getProvenance()` devuelve los números y
  la UI los dice: el aviso cuenta cuántas tiendas son reales y cada listado de
  una tienda en muestra lleva su marca `demo`. Un booleano global mentía en los
  dos sentidos.
- **Hoy el catálogo es SÓLO Magic** (`GAMES` en `src/lib/games.ts`). Primero se
  prueba el sistema entero con el único juego que tiene catálogo canónico
  (Scryfall) contra el cual resolver nombres; los demás están en `FUTURE_GAMES`.
  Detectar no es aceptar: se siguen detectando todos —si no, el Digimon de una
  tienda de Magic entraría como Magic— y `normalizeListing` descarta los que no
  están prendidos. Sumar un juego es moverlo de `FUTURE_GAMES` a `GAMES` y
  volver a sincronizar; `pruneGamesNotIn` limpia el catálogo en cada corrida.
- **El juego se detecta POR PRODUCTO, no por tienda.** Las tiendas reales venden
  varios TCG y lo declaran en `product_type` ("MTG Single", "Yugioh Single",
  "Pokemon Sealed"). `classifyProduct` lo usa como señal principal; el
  `defaultGame` de la tienda es sólo el respaldo. Sin esto, el Yu-Gi-Oh de una
  tienda de Magic entra al catálogo de Magic. Scryfall sólo resuelve Magic.
  Ese respaldo aplica a productos que NO nombran juego ("Cartas Sueltas"),
  nunca a los que nombran uno que no soportamos: `namesUnsupportedGame` los
  descarta, porque "Star Wars Single" en una tienda de Magic no es Magic.
- **TRANSITORIO — el registro de tiendas es `data/stores.json`.** Se muda a la
  base en cuanto exista el admin, que es donde se dan de alta las tiendas. Hasta
  entonces: Quitar una
  tienda de ahí la borra de la base en el siguiente sync (`pruneStoresNotIn`),
  con sus listados y las cartas que se quedan sin ninguno. El SQL del catálogo
  no filtra por tienda activa, así que dejarla "inactiva" no la sacaría del
  buscador.
- **Un feed cortado a la mitad se ingiere, pero NO barre agotados.** Una página
  que falla después de reintentos devuelve lo que alcanzó marcado como
  `partial`: tirar 3,500 productos ya descargados por un 500 pasajero deja a la
  tienda entera fuera del buscador. Con feed parcial no corre
  `markMissingAsOutOfStock` —lo ausente puede estar en las páginas que no
  llegaron— ni se sobrescribe el snapshot completo anterior.
- **Los snapshots se guardan normalizados** (`normalizeFeed`): sólo los campos
  que la ingesta usa, ordenados de forma estable. El feed crudo de Shopify trae
  `body_html` y timestamps volátiles, y hacía que el cron reescribiera 35 MB
  cada 6 horas aunque nada hubiera cambiado.
- **El look vive en tokens semánticos** definidos en el bloque `@theme` de
  `src/app/globals.css`: color (`paper`, `surface`, `line`, `ink`, `accent`,
  `ok`, `warn`), forma (`radius-card`, `radius-control`, `radius-pill`,
  `shadow-card`, `shadow-lift`) y tipografía. Las pantallas nunca usan valores
  literales —ni colores, ni radios, ni sombras— así que cambiar de piel es
  reescribir ese bloque.
  Sistema actual: estructura de marketplace (redondeo de 12px, sombra suave y
  fría, aire generoso, píldoras en botones y chips, base de 15px) sobre paleta
  de papel gris azulado, tinta azul marino y turquesa profundo como único
  acento. Una sola familia sans para todo: la jerarquía la hacen peso y tamaño.
- **Agotado no es catálogo.** Las tiendas dejan publicado lo que ya no tienen
  —95% de los listados ingeridos—, y un buscador que lo muestra le hace perder
  el tiempo al comprador igual que el sitio de la tienda. Se INGIERE todo (que
  una tienda la maneje es señal: a quién preguntarle, qué esperar) pero se
  MUESTRA sólo lo comprable: `searchCards` filtra por stock salvo que se pida lo
  contrario, y "N tiendas" cuenta tiendas donde se puede comprar hoy, no tiendas
  que la listan. Las que la tienen agotada van aparte y en chico.
- **Un listado capturado a mano SUPLANTA al del feed** para esa misma impresión
  y condición (`supersedeFeedListings`). No basta con no actualizarlo: si una
  corrida anterior ya lo había publicado, quedaban los dos y la misma carta de
  la misma tienda salía dos veces con dos precios. Los valores del feed no se
  pierden —viven en la advertencia— y vuelven si la tienda decide que gana él.
  Resolver a favor del feed BORRA el capturado y publica el del feed como
  listado nuevo; renombrar el capturado con el `external_id` del feed reventaba
  la llave única cuando otra fila ya lo tenía.
- **TRANSITORIO — el panel se abre con DOS llaves: la membresía y el token.**
  `abrirPanel` acepta las dos. La membresía (`users` + `memberships`) es lo
  definitivo; `stores.panel_token` sigue vivo porque matarlo el mismo día que
  llegaron las cuentas dejaría el panel muerto entre un deploy y el otro, y a las
  tiendas que ya tienen su link sin entrar mientras crean su cuenta. Se retira
  cuando las tres tiendas hayan entrado con correo. Si la URL trae token, ése se
  usa y no se cae a la sesión: si lo trae, es lo que quiso usar. Ninguna de las
  dos vías cree el slug de la URL —el token se compara contra la base y se exige
  que sea el de esa tienda; la membresía se consulta para esa tienda— porque si
  no, cambiar una palabra en la dirección editaría el inventario de otra. Token
  inválido, sin permiso y tienda inexistente dan el mismo 404: distinguirlos
  confirmaría cuáles existen. El panel no se indexa.
- **El precio de referencia sale de Scryfall, que republica TCGplayer bajo
  licencia.** Es la misma referencia con la que las tiendas mexicanas fijan sus
  precios, pero obtenida por una vía que no se puede cortar: scrapear TCGplayer
  o StarCityGames violaría sus términos y dejaría la plataforma parada el día
  que lo noten. Se pide por impresión concreta —set y número de colección— y se
  degrada avisando: si sólo se pudo empatar por nombre, la UI dice que el precio
  puede ser de otra edición. Nunca se sustituye el precio de un acabado por el
  de otro: una impresión sin foil no tiene precio foil, y rellenarlo con el de
  la no-foil sería inventarlo.
- **El tipo de cambio es el de hoy, y cuando no lo es, se dice.** Quemarlo en el
  código lo deja envejecer en silencio y sugerir precios mal sin que nadie lo
  note. `usdToMxn` lo consulta, lo valida contra una banda de cordura (8–60: una
  respuesta corrupta convertiría una carta de dos dólares en diez mil pesos) y
  cae a `MXN_POR_USD` o a un respaldo DECLARANDO cuál usó. En el panel es un
  campo con flechas de diez centavos, no un número fijo: la tienda lo sube para
  cubrir importación y margen —así es como ya fija sus precios— y la aritmética
  completa queda a la vista (`US$1.57 × 18.5 = $29.05`). El precio que se
  publica es el que quedó en el campo, no una fórmula que se recalcule sola: si
  se recalculara, el catálogo entero se movería con el dólar sin que la tienda
  lo decidiera.
- **"Cartas de moda" = las más BUSCADAS que además se pueden comprar.** Se
  miden tres señales con pesos distintos porque no dicen lo mismo: buscar (×1)
  es teclear un nombre, abrir la carta (×2) es interés, y el clic de salida (×3)
  es lo más cerca que estamos de ver una venta —ocurre en la tienda y nunca la
  vemos—. Contar sólo las cartas que se abren dejaba fuera a quien busca, mira
  el precio en la lista y se va, que es la mayoría. Mientras no haya búsquedas
  que contar, el respaldo ordena por disponibilidad y lo DICE, y excluye las
  tierras básicas: son lo que toda tienda surte, así que barren cualquier
  ranking y el home acababa presumiendo que Plains está en dos tiendas.
- **Una muestra tiene que mentir en el contenido, nunca en la FORMA.** El demo
  de MTG Wolf eran 24 staples de Commander, todos con stock, y por eso el plan
  de surtido SIEMPRE lo recomendaba: cubría las seis cartas de cualquier lista
  de prueba con datos inventados. Ahora sale de una muestra uniforme de los
  datos masivos de Scryfall (`npm run make-wolf-demo`): 800 listados, dos
  tercios con stock, mediana de seis pesos y sin la cola cara. Se parece a la
  carpeta de una tienda chica, que es lo que es.
- **NO ponemos a las tiendas a competir por precio.** Nada de coronar "la más
  barata", ni de anunciar la diferencia porcentual entre tiendas. El precio se
  muestra y se puede ordenar por él, pero nunca es el ranking por defecto:
  ocultarlo sería deshonesto con el comprador, premiarlo convierte a las tiendas
  en rivales. Lo que se premia es la COBERTURA — quién surte más de lo que el
  usuario busca— porque el problema real siempre fue la disponibilidad y porque
  el objetivo es concentrar el pedido en las menos tiendas posibles.
- **La ubicación vive en una cookie, no en el estado del cliente.** La vista de
  carta y el plan de surtido se calculan en el SERVIDOR; con la ubicación sólo
  en el navegador habría que reordenar tras hidratar, con parpadeo, y el plan
  jamás podría tomarla en cuenta. Se guarda redondeada a ~1 km: las coordenadas
  de las tiendas son el centro de su ciudad, así que más precisión no mejora
  nada y sería recolectar ubicación fina sin necesitarla. La cookie es entrada
  no confiable: `parseLocation` valida y devuelve null ante basura.
- **La identidad es de Supabase; el usuario es nuestro.** Supabase Auth prueba
  que el correo es suyo y nada más; de ahí para adelante la identidad que importa
  es la fila de `users`, porque es a ella que cuelgan membresías, comandas y
  wishlist. `auth_id` es el puente. Se entra con link al correo y no con
  contraseña: no hay nada que recordar, recuperar ni filtrar, y para una
  plataforma cuyo trato es "te aviso cuando aparezca tu carta", el correo
  verificado no es un trámite extra —es el producto. La sesión se valida con
  `getUser()`, nunca con `getSession()`: la cookie la controla el visitante.
- **Al entrar se ADOPTA la fila que ya exista con ese correo.** Es el caso
  normal: el admin da de alta la tienda y concede la membresía por correo ANTES
  de que el dueño haya entrado nunca; cuando entra, su `auth_id` se pega a esa
  fila y encuentra su panel ya armado. Crear una segunda fila lo dejaría sin
  tienda, y el índice único por correo reventaría.
- **El administrador se declara en `ADMIN_EMAILS`, no se gana por llegar
  primero.** "Si no hay admins, el primero que entre lo es" convierte a
  cualquiera que descubra la URL antes que nosotros en dueño de la plataforma.
- **El destino después de entrar se valida (`rutaSegura`).** Es un parámetro de
  la URL, o sea entrada de quien sea: sin validarlo, un link a
  `/entrar?next=https://otrositio` usa nuestro login como trampolín —la persona
  entra de verdad y acaba en otra parte creyendo que sigue aquí—. Sólo rutas de
  esta app, y `//host` queda fuera porque el navegador la lee como otro dominio.
  Y el link del correo regresa al dominio por el que LLEGÓ la petición
  (`origenDeLaPeticion`): quemar el de producción manda a quien prueba en local a
  producción.
- **El refresco de sesión vive en `src/proxy.ts`.** En Next 16 el archivo se
  llama `proxy`, no `middleware`. El token dura una hora y un Server Component no
  puede escribir cookies: intentar el refresco ahí perdería el token nuevo y
  desconectaría a la persona a media compra aunque su sesión fuera válida. El
  `matcher` excluye estáticos e imágenes, o habría una llamada al proveedor de
  identidad por cada icono.
- **Salir es POST.** Con GET, cualquier imagen o link ajeno apuntando a `/salir`
  sacaría a la persona de su sesión sin que lo pidiera.
- **UNA comanda abierta por persona**, con índice único parcial
  (`WHERE status = 'abierta'`). Es el carrito: dos pestañas armando listas
  distintas crearían dos comandas, y cada una pagaría su propia corrida del
  mensajero. Concentrar es justo lo que abarata la entrega.
- **Un renglón guarda la COPIA y la FUENTE, no una de las dos.** La copia
  congelada (nombre, set, condición, precio unitario) es lo que el usuario vio y
  aceptó; el `listing_id` es contra lo que se vuelve a verificar al pagar. Si el
  renglón leyera el precio del listado en cada vista, la tienda podría subirlo
  entre que el usuario armó la comanda y que pagó, sin que nadie se enterara.
- **La cantidad NUNCA rebasa el stock de la fuente**, ni al agregar, ni al
  repetir la misma fuente, ni al escribirla a mano. Sin el tope en el
  `ON CONFLICT`, apretar "Agregar" cinco veces dejaba cinco copias de la única
  que hay: una comanda que se rompe sola al pagar. El mismo listado dos veces es
  MÁS CANTIDAD, no otro renglón; la misma carta desde dos tiendas distintas sí
  son dos renglones.
- **El plan decide EN QUÉ TIENDA; `armarComanda` decide CUÁL listado.** Son dos
  preguntas distintas y colapsarlas hacía que el plan prometiera un total y la
  comanda cobrara otro. La llave del plan es el índice del pedido y no el id de
  la carta, porque una lista pegada puede traerla repetida; las repeticiones se
  suman por fuente ANTES de llegar a la base (`agruparPorFuente`), o el
  `INSERT ... ON CONFLICT` truena con "cannot affect row a second time".
- **Dentro de una tienda gana el precio; la condición sólo desempata.** Ordenar
  sólo por precio metía en silencio la copia más maltratada cuando cuesta lo
  mismo que una sana. Lo que NO se hace es preferir la mejor condición sobre el
  precio: el plan de `/lista` cuenta con el más barato, y si la comanda eligiera
  otro los dos totales no cuadrarían. La condición va SIEMPRE visible en el
  renglón.
- **El renglón dice de quién es la carta.** El stock de un afiliado suma al de
  su tienda, pero la carta es de él; el comprador tiene derecho a saberlo. Y si
  la tienda todavía es de muestra, el renglón lleva su marca `demo`: una comanda
  con renglones sintéticos no puede presentarse como una compra real.
- **La aritmética del dinero es pura y vive en `src/lib/comanda/money.ts`.**
  Nuestra comisión se RESTA del precio de las cartas, no se suma al usuario: de
  $500 el usuario paga $500. Sumarla encima subiría el precio de las cartas
  frente al de la tienda y nos pondría a competir con nuestros propios
  vendedores. Envío y consolidación sí se suman, porque no son cartas: son un
  servicio que le pagamos al mensajero, y por eso no entran a la base del pago a
  vendedores. El pago a vendedores nunca es negativo: una carta de tres pesos no
  cubre la cuota fija de la terminal, y un pago negativo no es un pago, es un
  error. Las tarifas de cobro están declaradas como SUPUESTO en un solo lugar, no
  repartidas por la aplicación.
- **La comisión de terminal se PARTE: la de las cartas sale del vendedor, la del
  envío sale del envío.** La terminal cobra una sola vez sobre todo el cargo,
  pero cada parte la absorbe quien la generó. El PORCENTAJE se reparte en
  proporción; la CUOTA FIJA se carga entera a las cartas, porque existe por haber
  un cobro y el cobro existe por la venta —el envío es un añadido—. Prorratearla
  también hacía que al vendedor le llegara distinto según la entrega que eligió el
  COMPRADOR, y esa es una decisión en la que el vendedor no tiene voz: así su
  descuento no depende de ella y él puede verificarlo. La parte del envío es el
  RESIDUO de la resta, no un segundo redondeo, para que las dos sumen exactamente
  lo que cobra la terminal sin inventar ni perder un centavo. `deliveryNetCents`
  dice qué queda del cobro de entrega para pagarle al mensajero, y puede salir
  negativo: eso significa que no alcanzó, y tiene que verse.
- **Una comanda con renglones de muestra NO SE COBRA.** Un listado de una tienda
  `data_source = 'sample'` tiene precio y stock sintéticos; cobrarlo sería vender
  una carta que no existe. La comanda sí se ARMA con ellos —es lo que permite
  enseñarle el flujo completo a un dueño de tienda antes de que su catálogo esté
  conectado— pero `revisarCobro` detiene el cobro y la pantalla dice por qué. El
  freno vive en el modelo, no en la conciencia de quien opere la plataforma.
- **Recoger no paga envío aunque las cartas vengan de otra ciudad**: si el
  usuario va a la tienda, no hay paquete.
- **La wishlist se llama por `card_id`, no por `printing_id`.** Cuando alguien
  quiere una carta la quiere como sea, así que cualquier impresión dispara el
  aviso. Y se avisa UNA vez: el índice único parcial
  `(user_id, card_id) WHERE notified_at IS NULL` deja un pendiente vivo por
  carta, y una fila ya avisada no estorba —volver a agregarla crea otra, que es
  justo lo que significa "la sigo queriendo"—. La regla vive en el ESQUEMA, no en
  el código que inserta.
- **Lo que no se consiguió no se escribe solo en la wishlist.** Se enseña y el
  usuario decide: la wishlist es suya, no un efecto colateral de haber buscado.
  Los nombres que el catálogo no reconoce se REPORTAN, nunca se adivinan, igual
  que en la importación de inventario.
- **Ninguna acción cree un id que venga del formulario.** El `comanda_id` se
  resuelve desde la sesión y cada renglón se toca con `WHERE comanda_id = ...`;
  el precio y la tienda de una fuente se leen de la base. Con el precio en el
  formulario, cualquiera compraría una carta de mil pesos en uno.
- **El SQL de cuentas vive en `src/lib/db/accounts.ts`**, aparte de `queries.ts`,
  que es el catálogo: son las personas y su relación con los vendedores, no
  cartas. La regla de que las pantallas no hablan con Postgres directo se
  mantiene igual.
- **Un afiliado NO administra la tienda que lo avala.** En `sellers`, `store_id`
  significa dos cosas según el `type`: para una tienda es ella misma, para un
  afiliado es quien lo avala. Unir sin distinguir le daba al afiliado el panel de
  la tienda.
- **El id del usuario sale de la sesión, nunca del formulario.** Si viniera del
  formulario, cambiar un número editaría el perfil de otra persona.
- **El perfil se escribe sin `COALESCE`: null BORRA.** Un teléfono capturado mal
  que no se puede vaciar se vuelve un dato equivocado permanente.
- **El criterio de cercanía es MISMA CIUDAD antes que kilómetros**
  (`proximityRank`). Es la única diferencia que el comprador siente —recoger en
  tienda, envío al día siguiente—; entre dos ciudades distintas todo es
  paquetería y 300 o 600 km dan casi lo mismo. Con ubicación, la cercanía es el
  orden por defecto de los listados; sin ella, la tienda. Nunca el precio.
- **`planFulfillment` es cubrimiento de conjuntos voraz**, no optimización de
  precio: elige la tienda que agrega más cartas nuevas y desempata por costo.
  Partir la compra entre seis tiendas para ahorrar unos pesos sale peor en
  envíos y esperas, y es justo lo que no queremos empujar.
- **Dos motores de búsqueda, no uno**: carta suelta (`/buscar`) y lista pegada
  (`/lista`, que responde "qué tienda cubre más de tu lista"). El segundo es el
  que las tiendas ya ofrecen sobre su propio inventario; el valor está en
  cruzarlo entre tiendas.
- La UI está en español mexicano; los nombres de carta se quedan en inglés
  porque así los titulan las tiendas.

## Comandos

```bash
npm run dev                                 # servidor de desarrollo
npm run db:migrate                          # aplica el esquema (idempotente)
npm run sync                                # ingerir desde data/snapshots/
npm run sync -- --live [--store=<slug>]     # ingerir feeds reales
npm run snapshot -- --store=<slug>          # capturar un feed sin ingerirlo
npm run make-samples                        # regenerar datos de muestra (usa Scryfall)
npm run make-wolf-demo                      # regenerar el demo de MTG Wolf
npm run snapshots:normalize                 # reescribir snapshots en forma estable
npm run catalog:seed                        # siembra las ~33,000 cartas de Magic
npm run db:check                            # diagnostica DATABASE_URL sin revelarla
npm run smoke                               # reporte del catálogo real (sólo lectura)
npm run probe -- <dominio>                  # ¿ese dominio sirve un feed de Shopify?
npm run panel:token -- --store=<slug>       # link del panel de esa tienda
npm run typecheck
npm test
```

Producción: <https://tcgpool.vercel.app>. Los workflows de GitHub Actions
(`sync`, `smoke`, `probe`) corren con el secreto `DATABASE_URL` del repositorio:
son la única vía para tocar la base desde donde no se tiene la cadena.

## Stack

Next.js (App Router) + PostgreSQL (`pg`) + Tailwind, desplegado en Vercel.
Una sola base para catálogo y señales de demanda, con `DATABASE_URL` como única
configuración indispensable. El build no la toca: sólo compila. La ingesta corre
aparte (cron de GitHub Actions) y escribe directo a la base.

Las cuentas usan Supabase Auth y piden dos variables más
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) más
`ADMIN_EMAILS`. Sin ellas el buscador funciona igual y `/entrar` lo dice: las
cuentas son una capa encima del catálogo, no su cimiento. Ver `.env.example`.
En Supabase hay que dar de alta las URLs de retorno (Authentication → URL
Configuration → Redirect URLs): `https://tcgpool.vercel.app/auth/callback` y
`http://localhost:3000/auth/callback`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
