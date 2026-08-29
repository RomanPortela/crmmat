// Seed de plantillas de mensajes — extraídas del prompt del agente IA
const TEMPLATES = [
  // ══════════ SALUDO E INICIO ══════════
  { s:'saludo', sl:'Saludo e inicio', so:1, io:1,
    t:'Saludo inicial',
    c:'Primer mensaje con el que arrancás cualquier conversación nueva.',
    m:'Buenas! Cómo andas? 👋' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:2,
    t:'Respuesta a consulta de pago (antes de elegir modelo)',
    c:'Cuando el cliente pregunta por formas de pago antes de mencionar un modelo. Se cierra invitando a que diga qué busca.',
    m:'Obvio sii ✨\nPodés abonar en efectivo, transferencia y con tarjeta de crédito en hasta 6 cuotas! Además también sumamos créditos personales con el DNI!\nAvisame y te cotizo el modelo que busques 📲' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:3,
    t:'Cliente manda mensaje vago',
    c:'Cuando alguien escribe algo tipo "quiero eso" sin contexto. Respuesta corta y con humor.',
    m:'Holaa que? 🤔' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:4,
    t:'Cuando no entendés el mensaje',
    c:'Honesto, sin inventar. Se pide aclaración de forma casual.',
    m:'No entiendo... 🤔' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:5,
    t:'Mensaje poco claro o incompleto',
    c:'Cuando el cliente escribe algo vago y necesitás que amplíe. Casual, no ofensivo.',
    m:'desarrolle jaja 😅' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:6,
    t:'Cliente se disculpa por preguntar',
    c:'Cuando el cliente dice "perdón por molestar" o similar.',
    m:'No es molestia! 😊' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:7,
    t:'Consultar si es de Bahía Blanca',
    c:'Para saber si puede venir al local o hay que coordinar envío.',
    m:'¿sos de acá de Bahía? 📍' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:8,
    t:'Cliente de otra ciudad',
    c:'Cuando el cliente no es de Bahía Blanca y hay que coordinar envío.',
    m:'trabajamos con comisionista, avisame y coordinamos el envío 📦' },

  { s:'saludo', sl:'Saludo e inicio', so:1, io:9,
    t:'Cierre relajado sin presión',
    c:'Para cerrar cuando el cliente necesita pensarlo. Sin insistir.',
    m:'avisame nomas 👍' },

  // ══════════ ASESORÍA — PREGUNTAS A/B/C/D ══════════
  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:1,
    t:'Pregunta A — Uso que le va a dar',
    c:'Primera pregunta después de que el cliente nombra un modelo. Siempre reaccionás con entusiasmo primero.',
    m:'El [modelo] está muy bueno! 📸 ¿Qué uso buscabas darle?' },

  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:2,
    t:'Pregunta B — ¿Es tu primer iPhone?',
    c:'Segunda pregunta obligatoria. Define si más adelante se puede ofrecer canje o no.',
    m:'¿Es tu primer iPhone? 🤔' },

  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:3,
    t:'Pregunta C — Pro Max sin contexto claro',
    c:'Cuando el cliente pidió un Pro Max pero no dijo si es por pantalla o por cámara.',
    m:'¿El Pro Max lo buscás por la pantalla grande, o más por la cámara?' },

  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:4,
    t:'Pregunta C — Pro sin contexto claro',
    c:'Cuando el cliente pidió un Pro pero no dijo el motivo.',
    m:'¿Lo buscás por la cámara o más por precio?' },

  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:5,
    t:'Pregunta C — Modelo base sin contexto',
    c:'Cuando el cliente pidió un modelo base sin explicar por qué.',
    m:'¿Es por presupuesto principalmente?' },

  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:6,
    t:'Pregunta C — Cliente mencionó batería o trabajo',
    c:'Cuando el cliente dijo que necesita que le dure todo el día o que es para trabajar. Se le explica por qué el Pro rinde mejor y se le abre la opción de tamaño.',
    m:'Justo el [modelo] base no lo tengo, pero te recomiendo pasar al [modelo] Pro porque rinde mejor con la batería para el laburo 🔋. ¿Te gusta el tamaño normal o preferís dar el salto al Pro Max por una pantalla más grande, o te resulta incómodo muy grande? 👀' },

  { s:'asesoria', sl:'Asesoría — Preguntas A/B/C/D', so:2, io:7,
    t:'Pregunta D — Almacenamiento',
    c:'Se hace después de la C, solo si el cliente no mencionó capacidad y hay varias opciones en stock.',
    m:'¿Tenés preferencia de almacenamiento? Tengo en 128GB y 256GB. 💾' },

  // ══════════ ECHOING — CONFIRMAR QUE ESCUCHASTE ══════════
  { s:'echoing', sl:'Echoing — Confirmar que escuchaste', so:3, io:1,
    t:'Echo variante 1 — Claaro',
    c:'Repetís brevemente lo que dijo el cliente y lo tranquilizás. Nunca usar guion largo (—).',
    m:'Claaro, para [uso]. De eso despreocupate. 😌' },

  { s:'echoing', sl:'Echoing — Confirmar que escuchaste', so:3, io:2,
    t:'Echo variante 2 — Bien bien',
    c:'Alternativa al echo anterior. Nunca repetir la misma estructura dos veces seguidas.',
    m:'Bien bien, [paráfrasis]. Para eso te doy banda. 💪' },

  { s:'echoing', sl:'Echoing — Confirmar que escuchaste', so:3, io:3,
    t:'Echo variante 3 — Entiendo',
    c:'Tercera variante para no repetir el patrón.',
    m:'Entiendo, [paráfrasis]. Eso está cubierto. ✅' },

  { s:'echoing', sl:'Echoing — Confirmar que escuchaste', so:3, io:4,
    t:'Echo variante 4 — Barbaro',
    c:'Variante que sirve para pasar directo a mostrar productos.',
    m:'Barbaro 🔥. Para [uso] son ideales estos: 📲' },

  // ══════════ MOSTRAR PRODUCTOS ══════════
  { s:'productos', sl:'Mostrar productos', so:4, io:1,
    t:'Antes de mostrar el listado',
    c:'Frase que antecede a la lista de equipos disponibles.',
    m:'Te muestro que tengo en ese rango y vos me decís 📲' },

  { s:'productos', sl:'Mostrar productos', so:4, io:2,
    t:'Después de mostrar las opciones',
    c:'Cierre positivo después de listar los equipos disponibles.',
    m:'Pero en esa gama todos son MUY buenos en calidad precio! 💎' },

  { s:'productos', sl:'Mostrar productos', so:4, io:3,
    t:'Modelo exacto NO está en stock',
    c:'OBLIGATORIO como primera línea del mensaje cuando el modelo pedido no aparece en la búsqueda SQL. Nunca mostrar ese modelo en la lista después de decir esto.',
    m:'Justo el [modelo exacto] no lo tenemos en stock. 😔' },

  { s:'productos', sl:'Mostrar productos', so:4, io:4,
    t:'Urgencia de stock — última unidad',
    c:'Cuando queda un solo equipo de ese modelo. Genera urgencia real, no inventada.',
    m:'me queda el último en stock, literal 🤷‍♂️' },

  { s:'productos', sl:'Mostrar productos', so:4, io:5,
    t:'Urgencia de stock — variante corta',
    c:'Alternativa más directa para comunicar poco stock.',
    m:'1 sola unidad! 🚨' },

  // ══════════ EXPLICACIONES PROACTIVAS ══════════
  { s:'explicaciones', sl:'Explicaciones proactivas', so:5, io:1,
    t:'Explicación sobre baterías',
    c:'Se manda sin que lo pidan cuando el cliente muestra dudas sobre el estado de la batería.',
    m:'Las baterías arrancan al 100% y van bajando con el tiempo. Al 100% tienen unos 4 años de vida útil. Cuando baja mucho se cambia y listo... 🔋' },

  { s:'explicaciones', sl:'Explicaciones proactivas', so:5, io:2,
    t:'Miedo a comprar usado',
    c:'Cuando el cliente duda por ser un equipo usado. Se enfoca en la garantía real.',
    m:'No importa tanto que sea usado si lo comprás en un lugar con garantía real... 🛡️' },

  { s:'explicaciones', sl:'Explicaciones proactivas', so:5, io:3,
    t:'Cierre de confianza',
    c:'Frase de cierre que refuerza la seriedad del negocio.',
    m:'todos los equipos que vendemos son testeados y con garantía 🛡️' },

  { s:'explicaciones', sl:'Explicaciones proactivas', so:5, io:4,
    t:'Cliente pregunta algo muy básico',
    c:'Se responde con humor sin hacerlo sentir mal, y después se contesta bien igual.',
    m:'que pregunta.. jajaj 😂' },

  { s:'explicaciones', sl:'Explicaciones proactivas', so:5, io:5,
    t:'Cliente con poca experiencia tech o mayor',
    c:'Cuando detectás señales como "soy grande", "no entiendo mucho". Lenguaje simple y paciente.',
    m:'no se preocupe, esto no es obvio 😊' },

  // ══════════ ACCESORIOS ══════════
  { s:'accesorios', sl:'Accesorios', so:6, io:1,
    t:'Ofrecer cable y cargador',
    c:'Se ofrece UNA SOLA VEZ después de que el cliente eligió el equipo. Si dice que no o ignora, NUNCA se vuelve a ofrecer.',
    m:'¿Tenés cable y cargador certificados? 🔌' },

  // ══════════ CANJE ══════════
  { s:'canje', sl:'Canje de usados', so:7, io:1,
    t:'Ofrecer el canje',
    c:'Solo si el cliente NO dijo que es su primer iPhone y ya eligió equipo.',
    m:'¿Tenés un iPhone? Tomamos a partir del 11 en adelante en forma de pago! ♻️' },

  { s:'canje', sl:'Canje de usados', so:7, io:2,
    t:'Pregunta 1 — GB y batería',
    c:'Primer dato que se pide del equipo que entrega. Se espera respuesta antes de la siguiente.',
    m:'¿Cuántos GB tiene y qué % de batería? 🔋' },

  { s:'canje', sl:'Canje de usados', so:7, io:3,
    t:'Pregunta 2 — Estado físico (OBLIGATORIA)',
    c:'Segunda pregunta obligatoria, en mensaje separado. Nunca cotizar sin tener esta respuesta.',
    m:'¿Tiene algún detalle? Pantalla rota, tapa trasera, Face ID que no funcione, o pantalla cambiada por módulo no original? 👀' },

  { s:'canje', sl:'Canje de usados', so:7, io:4,
    t:'Cotización sin daños',
    c:'Cuando el equipo está en buen estado. Se aclara que Mati lo revisa en el local.',
    m:'Tu [modelo] de [GB]GB con [batería]% de batería, hoy cotiza en $[valor] USD.\nMati lo va a chequear en el local — si está todo ok como decís, ese es el valor.\nSi tiene rayones o detalles leves, se chequea pero no se suele bajar — entendemos que es un equipo usado.' },

  { s:'canje', sl:'Canje de usados', so:7, io:5,
    t:'Cotización con daño (desglosada)',
    c:'Siempre se muestra el valor base primero, después el descuento del repuesto, y recién el total. Nunca decir "el descuento ya está incluido".',
    m:'Tu [modelo] de [GB]GB con [batería]% de batería, hoy cotiza en $[valor base] USD.\nLa [pieza] rota nos cuesta $[costo] de repuesto arreglarla — no la mano de obra, solo el repuesto. Así que queda en $[valor base] - $[costo] = $[valor final] USD.\nMati lo va a chequear en el local — si todo está ok, ese es el valor.' },

  { s:'canje', sl:'Canje de usados', so:7, io:6,
    t:'Resumen con canje aplicado',
    c:'Cierre después de cotizar el equipo que entrega.',
    m:'El [nuevo] de $[precio] menos $[canje] por tu [viejo] = $[total] USD a pagar. ¿Cómo lo ves?' },

  { s:'canje', sl:'Canje de usados', so:7, io:7,
    t:'iPhone anterior al 11',
    c:'Cuando el cliente ofrece un modelo que no tomamos. Se le sugiere venderlo por su cuenta.',
    m:'El [modelo] lamentablemente no lo tomamos — tomamos a partir del 11. Si querés podés venderlo por Mercado Libre y con esa plata sumás al pago del equipo nuevo. ¿Cómo lo ves?' },

  // ══════════ MÉTODO DE PAGO ══════════
  { s:'pago', sl:'Método de pago', so:8, io:1,
    t:'Preguntar cómo prefiere pagar',
    c:'Cuando el saldo ya está claro. Nunca asumir que va a financiar — se ofrecen todas las opciones.',
    m:'¿Cómo preferís pagar los $[saldo]? 💳💵\n- Efectivo (pesos o dólares)\n- Transferencia en pesos\n- Tarjeta de crédito en cuotas\n- Crédito personal con DNI' },

  { s:'pago', sl:'Método de pago', so:8, io:2,
    t:'Preguntar cuotas (solo si eligió tarjeta)',
    c:'Solo se pregunta DESPUÉS de que el cliente eligió tarjeta. Se muestra el recargo de cada opción.',
    m:'¿En cuántas cuotas?\n- 1 cuota (+12% de recargo)\n- 3 cuotas (+35% de recargo)\n- 6 cuotas (+50% de recargo)' },

  { s:'pago', sl:'Método de pago', so:8, io:3,
    t:'Desglose del cálculo de cuotas',
    c:'Siempre se muestran los 3 pasos: USD → pesos → recargo → cuota mensual.',
    m:'$[monto USD] × $[cotización] = $[monto pesos] pesos\nCon el recargo de [N] cuotas (+[%]%): $[monto pesos] × [factor] = $[total]\nEn [N] cuotas: $[cuota] por mes' },

  { s:'pago', sl:'Método de pago', so:8, io:4,
    t:'Explicación de cotización para pago en pesos (OBLIGATORIA)',
    c:'ANTES de pasar cualquier alias hay que dar el total exacto en pesos y explicar la cotización en el mismo mensaje.',
    m:'Bárbaro [nombre] 🔥. El equipo te queda en $[USD] USD. Trabajamos con la cotización de nuestra financiera del día, que hoy es $[cotización], por lo que serían $[total pesos] pesos.\nTransferís al alias altech.mp a nombre de Matías Ganzero. 💸\nUna vez que hagas la transferencia avisame con el comprobante y te agendamos el turno. ¿A nombre de quién lo anotamos?' },

  { s:'pago', sl:'Método de pago', so:8, io:5,
    t:'Desglose del total itemizado',
    c:'Nunca dar un número total sin explicar de dónde sale cada parte.',
    m:'El [modelo] $[precio] USD, menos $[canje] del [equipo entregado] = $[subtotal] USD del equipo.\nEl cargador son $30.000 pesos ($19 USD a la cotización de hoy).\nTotal a pagar: $[subtotal] USD del equipo + $30.000 pesos del cargador. ✅' },

  { s:'pago', sl:'Método de pago', so:8, io:6,
    t:'Crédito personal — qué pasa si no es apto',
    c:'Cuando el cliente pregunta antes de dar el CUIL. Tranquilizador, sin cerrar puertas.',
    m:'Casi siempre que sí! Pero en el caso de que no, te avisamos y buscamos juntos otra solución — menos cuotas en tarjeta, más adelanto, o un equipo más accesible. No te quedás sin opciones.' },

  { s:'pago', sl:'Método de pago', so:8, io:7,
    t:'Crédito personal — pedir CUIL',
    c:'Después se ejecuta Derivar y el local retoma la conversación.',
    m:'Barbaro. Vamos a pasar tu CUIL al local para verificar si estás apto — te van a estar contactando.' },

  { s:'pago', sl:'Método de pago', so:8, io:8,
    t:'No aceptamos Mercado Pago',
    c:'Se redirige a las alternativas que sí aceptamos.',
    m:'Mercado Pago no lo aceptamos, pero podés pagar con tarjeta de crédito en hasta 6 cuotas, transferencia en pesos, o crédito personal con el DNI. ¿Cuál te viene mejor?' },

  { s:'pago', sl:'Método de pago', so:8, io:9,
    t:'No aceptamos Tarjeta Naranja',
    c:'Misma lógica que Mercado Pago — se ofrecen alternativas.',
    m:'Tarjeta Naranja no la aceptamos. Sí aceptamos cualquier otra tarjeta de crédito en hasta 6 cuotas, transferencia, efectivo o crédito personal con el DNI. ¿Tenés alguna de esas?' },

  // ══════════ SEÑA ══════════
  { s:'sena', sl:'Seña y reserva', so:9, io:1,
    t:'Proponer seña — variante 1',
    c:'OBLIGATORIO ofrecerla antes de agendar cualquier turno. Amable, sin presionar.',
    m:'Para asegurar que el equipo esté cuando llegues, podés dejar una seña de $30.000. Así te lo reservamos con tu nombre. ¿Te copa? 🤝' },

  { s:'sena', sl:'Seña y reserva', so:9, io:2,
    t:'Proponer seña — variante 2',
    c:'Alternativa más breve para no repetir siempre lo mismo.',
    m:'Si querés que te lo guardemos, la seña son $30.000. Lo dejamos a tu nombre y listo. ✅' },

  { s:'sena', sl:'Seña y reserva', so:9, io:3,
    t:'Proponer seña — variante 3',
    c:'Variante que le da la opción abierta al cliente.',
    m:'La seña de $30.000 nos sirve para reservártelo — así cuando llegues está asegurado. ¿Preferís hacerlo o venís sin seña? 👀' },

  { s:'sena', sl:'Seña y reserva', so:9, io:4,
    t:'Cliente acepta la seña',
    c:'Se pasa el alias y se pide el comprobante junto con el nombre del titular.',
    m:'Transferís $30.000 al alias reserva.altech, a nombre de Candela Justel. Cuando tengas el comprobante me avisás — y decime a nombre de quién va a llegar así lo registramos. 📲' },

  { s:'sena', sl:'Seña y reserva', so:9, io:5,
    t:'Cliente NO quiere dejar seña',
    c:'Se anota el turno igual, sin amenazar ni presionar.',
    m:'Dale, perfecto! 🔥 Anotamos el turno igual. El equipo sigue disponible, cualquier cosa avisá.' },

  // ══════════ AGENDAMIENTO ══════════
  { s:'agenda', sl:'Agendamiento de turnos', so:10, io:1,
    t:'Preguntar cuándo puede venir',
    c:'Después de ofrecer la seña. Se consulta la agenda antes de confirmar.',
    m:'¿Cuándo te queda bien venir? 📅' },

  { s:'agenda', sl:'Agendamiento de turnos', so:10, io:2,
    t:'Dirección del local',
    c:'Siempre se da la dirección completa con la referencia.',
    m:'Estomba 546 entrepiso B, Bahía Blanca (al lado de Della Nona) 📍' },

  { s:'agenda', sl:'Agendamiento de turnos', so:10, io:3,
    t:'Horario fuera de rango',
    c:'Cuando el cliente pide un turno fuera del horario de atención.',
    m:'Trabajamos de lunes a viernes de 11 a 18 hs y sábados de 10 a 15 hs. ¿Te queda bien algún horario dentro de esos?' },

  { s:'agenda', sl:'Agendamiento de turnos', so:10, io:4,
    t:'Reprogramar turno',
    c:'Cuando el cliente no puede venir en el horario acordado.',
    m:'No hay problema! ¿Para cuándo te queda mejor?' },

  { s:'agenda', sl:'Agendamiento de turnos', so:10, io:5,
    t:'Confirmación de turno reprogramado',
    c:'Después de consultar la agenda y ejecutar reprogramar_turno.',
    m:'Listo, te moví para el [día] a las [hora]. Te esperamos!' },

  { s:'agenda', sl:'Agendamiento de turnos', so:10, io:6,
    t:'Cancelación de turno',
    c:'Cuando el cliente quiere cancelar definitivamente.',
    m:'Dale, cancelamos el turno. Si en algún momento querés volver, avisanos. Y si dejaste seña, hablalo con Mati para coordinar.' },

  // ══════════ OBJECIONES ══════════
  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:1,
    t:'"Es muy caro"',
    c:'Primero se entiende si es presupuesto o percepción de valor, antes de responder.',
    m:'¿Es más el tema presupuesto o te parece que no vale la pena?' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:2,
    t:'"El dólar está muy caro"',
    c:'Se explica que es la cotización real de la financiera y se ofrece la alternativa de pagar en USD.',
    m:'La cotización que usamos es la de la financiera con la que trabajamos — es el precio real al que se mueven los dólares en el mercado. 💱\nSi tenés dólares en mano te salís de eso directamente — pagás en USD y listo, sin cotización de por medio. 💵\nSi pagás en pesos, se usa la cotización del día — igual que en cualquier casa de cambio o banco. ✅' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:3,
    t:'"Lo vi más barato en otro lado"',
    c:'Primero se pregunta dónde, después se explica la diferencia.',
    m:'¿Dónde lo viste?' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:4,
    t:'"Lo vi en MercadoLibre más barato"',
    c:'Respuesta específica para MercadoLibre: no se puede verificar el equipo antes de comprarlo.',
    m:'En Meli hay de todo jaja. El problema es que no podés verificar antes de comprar, no sabés si la batería es real o si tiene piezas cambiadas.\nAcá venís, lo probás, chequeamos la batería en el momento, y si algo falla dentro de la garantía volvés. Ese es el valor.' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:5,
    t:'"No lo actualizan / es viejo"',
    c:'Se desmiente con datos concretos sobre soporte de iOS.',
    m:'Eso es un mito.\nAcaba de salir iOS 18 y Apple ya confirmó el 19 y 20. Mínimo 3-4 años más de updates.\n¿Qué uso buscabas darle?' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:6,
    t:'"Prefiero esperar al modelo nuevo"',
    c:'Se respeta la decisión pero se muestra el costo de esperar.',
    m:'Dale, es tu decisión.\nPero el 17 salió hace 2 meses, el 18 sale en 12. En ese tiempo el 16 ya bajó bastante.\nSi comprás ahora con tu equipo en canje, lo amortizás rápido. ¿Cómo lo ves?' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:7,
    t:'"Quiero uno nuevo/sellado"',
    c:'Primero se entiende si es por garantía o por la experiencia de estrenar.',
    m:'¿Lo buscás nuevo por garantía o porque te gusta que sea sin abrir?' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:8,
    t:'"No confío en los usados"',
    c:'Se enfoca en la garantía real como diferencial.',
    m:'Comprarlo usado no importa tanto si lo comprás en un lugar con garantía real.\nEs como comprar una Ferrari usada — la calidad no cambia.\ntodos los equipos que vendemos son testeados y con garantía 🛡️' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:9,
    t:'"¿Cómo sé que la batería es verdad?"',
    c:'Se ofrece verificarlo en persona, en el momento.',
    m:'Cuando venís lo vemos en Settings > Battery Health, vos mismo, en el momento. Nada de capturas ni fotos.' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:10,
    t:'"¿Qué pasa si se daña?"',
    c:'Se explica la garantía sin tecnicismos.',
    m:'Garantía oficial Apple. Si falla sin culpa tuya, se arregla.\nNuestros clientes vuelven cuando quieren hacer upgrade, no porque se rompió.' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:11,
    t:'"No tengo presupuesto ahora"',
    c:'Se abren alternativas de financiación sin presionar.',
    m:'No hay drama. Podés combinar efectivo con cuotas, o hacer crédito personal con el DNI.\n¿Cuánto podrías poner ahora y financiamos el resto?' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:12,
    t:'"Necesito tarjeta sin interés"',
    c:'Se aclara la realidad y se ofrece la alternativa del crédito personal.',
    m:'En tarjeta todas las cuotas tienen interés. También está crédito personal — 3 cuotas fijas en USD, solo con el DNI.' },

  { s:'objeciones', sl:'Manejo de objeciones', so:11, io:13,
    t:'Cliente sin límite en la tarjeta',
    c:'Se ofrecen tres caminos alternativos sin hacerlo sentir mal.',
    m:'Nono hay drama. Podés hacer menos cuotas para que baje el monto, usar crédito personal con el DNI, o mirar un equipo un poco más accesible. ¿Cuál te cierra más?' },

  // ══════════ CASOS ESPECIALES ══════════
  { s:'especiales', sl:'Casos especiales', so:12, io:1,
    t:'Cliente pide fotos del equipo',
    c:'El bot no puede mandar fotos. Se deriva a Mati y se ofrece verlo en persona.',
    m:'Las fotos las tiene Mati en el local — te las puede mandar él directamente. De todas formas cuando venís lo ves, lo probás y chequeamos todo en el momento. ¿Querés que te agendemos un turno?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:2,
    t:'Comparar dos modelos',
    c:'Se responde con la diferencia clave según el uso que ya declaró el cliente, sin tirar specs técnicas.',
    m:'Para lo que me dijiste, el [modelo A] te da [ventaja]. El [modelo B] es más accesible. ¿Querés que te muestre los dos?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:3,
    t:'Cliente quiere el mismo modelo que ya tiene',
    c:'Se pregunta el motivo antes de mostrar nada, porque suele haber una razón puntual.',
    m:'¿Lo buscás para reemplazarlo por alguna razón? ¿Rotura, más almacenamiento, cambio de color?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:4,
    t:'Cliente quiere cambiar por rotura',
    c:'A veces conviene repararlo en lugar de cambiarlo. Se ofrece esa opción primero.',
    m:'Si es por rotura, quizás conviene verlo primero con Mati — a veces la reparación sale mucho menos. ¿Qué tiene?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:5,
    t:'Compra de regalo — preguntas iniciales',
    c:'Cuando el cliente compra para otra persona, las preguntas apuntan al destinatario.',
    m:'Qué bueno! ¿Cuántos años tiene? ¿Usa iPhone actualmente o sería su primer iPhone?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:6,
    t:'Compra de regalo — confirmación',
    c:'Cierre cuando ya eligieron el equipo para regalar.',
    m:'Genial, el [modelo] es una excelente elección para regalo. ¿Querés pasar a verlo o lo coordinamos con turno?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:7,
    t:'Cliente pregunta precio sin contexto',
    c:'No se tira el precio solo — primero se asesora entendiendo el uso.',
    m:'El [modelo] está muy bueno! ¿Qué uso buscabas darle?' },

  { s:'especiales', sl:'Casos especiales', so:12, io:8,
    t:'Cliente insiste solo en el precio',
    c:'Se da el precio pero igual se pregunta el uso para poder asesorar.',
    m:'El [modelo] arranca en $[precio] USD. ¿Para qué lo buscás? Así te recomiendo el que más te conviene.' },

  { s:'especiales', sl:'Casos especiales', so:12, io:9,
    t:'Precio en pesos',
    c:'Se convierte usando la cotización del día y se aclara que varía.',
    m:'Te lo paso en pesos! El [modelo] sale $[USD] USD. A $[cotización] el dólar son $[total] pesos aprox — aunque la cotización varía día a día.' },

  { s:'especiales', sl:'Casos especiales', so:12, io:10,
    t:'Cliente viene de un anuncio',
    c:'Ya eligió el producto, no hace falta el checklist completo. Se va más rápido.',
    m:'Sisi lo tenemos!\n¿Es para vos? ¿Venís de iPhone o de otro celular?' },
];

module.exports = TEMPLATES;
