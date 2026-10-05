<div align="center">
  <img src="bosquesinos.jpg" alt="Logo Bosquesinos" width="600">
</div>

# 🌱 Plataforma Web Bosquesinos: Nuestro Vivero Digital

**Visión:** Más que un software, esta es una herramienta construida desde el territorio para auditar, gestionar y proteger el patrimonio forestal y cultural de San Luis, Antioquia. Nuestro objetivo es demostrar que la tecnología puede y debe adaptarse a la vida comunitaria, garantizando que la **"conservación en manos campesinas"** sea transparente, medible y libre de biopiratería.

---

## 🌳 ¿Cómo funciona nuestra estrategia?

Hemos diseñado el sistema bajo un modelo de **"Vitrina Abierta, Motor Cerrado"**. Esto significa que invitamos al mundo a conocer y apoyar nuestro trabajo, pero mantenemos el control absoluto sobre nuestros datos sensibles y nuestro territorio.

### 1. El Vivero es de Todos (Inventario Comunal)
En el código y en la vida real, el vivero es uno solo. No dividimos las plantas por parcelas individuales; todo lo que entra al sistema hace parte del esfuerzo colectivo de la Asociación Bosquesinos. A través de la plataforma, nuestros operarios pueden registrar el avance de la vida de las plantas (desde el semillero hasta que están listas para ser sembradas) manteniendo un conteo real de nuestra capacidad instalada.

### 2. El Pasaporte de la Semilla (Trazabilidad y Origen)
Aunque el vivero es de todos, **el origen se respeta y se audita**. Cada lote de semillas que entra al vivero se registra con un "pasaporte" digital inmutable que nos dice:
*   **De qué finca o parche de bosque viene:** Para mapear la salud de nuestro territorio.
*   **Quién es el Árbol Madre:** Nos permite hacerle seguimiento a los mejores individuos del bosque sin revelar públicamente sus coordenadas (protegiéndolos de saqueos).
*   **Quién lo trajo:** El sistema etiqueta automáticamente al operario o bosquesino que hizo la recolección, dándole el crédito por su trabajo en campo.

### 3. Muro de Saberes (Nuestra Propiedad Intelectual)
No queremos que nuestro conocimiento tradicional se pierda o sea extraído sin reconocimiento. En el catálogo botánico, cada especie tiene un "Muro de Saberes". Si un compañero sube un tratamiento para germinar una semilla, una receta tradicional o la historia de un árbol, **su nombre queda firmado junto a la fecha**. Es un archivo digital de derechos de autor para nuestra memoria campesina.

### 4. El Puente con los Aliados (Economía Solidaria)
La cara pública de la plataforma es una vitrina hermosa donde los visitantes, turistas e instituciones pueden enamorarse de nuestra flora nativa.
*   Pueden leer sobre las plantas y nuestros saberes, pero **no pueden ver dónde están los árboles madre ni modificar el inventario**.
*   A través del "Carrito de Apoyo", un visitante puede seleccionar las plántulas que desea apadrinar o adquirir, enviando un mensaje directo a nuestro WhatsApp. Sin intermediarios, conectando el campo directo con quien quiere sumar.

---

## 🛠️ Los Fierros (Arquitectura Tecnológica)

Para el equipo técnico, esta es la estructura que soporta la plataforma:
*   **Frontend (Lo que vemos):** Construido en HTML5, CSS3 y JavaScript Vanilla. Súper liviano y pensado para que cargue rápido en los celulares de los compañeros en el campo. Usamos acordeones y menús desplegables para no saturar la pantalla.
*   **Backend (El cerebro):** Node.js con Express, alojado en Render.
*   **Base de Datos:** MongoDB Atlas. Un modelo NoSQL perfecto para manejar listas de saberes y el historial de crecimiento de los lotes.
*   **Seguridad:** Accesos protegidos con JSON Web Tokens (JWT) y contraseñas encriptadas con `bcrypt`. El sistema sabe exactamente qué asociado inició sesión y le muestra solo los lotes que le corresponden administrar.

---

## 🚧 Retos y Siguientes Pasos (Para tener en cuenta)

Como todo proyecto que nace, tenemos un producto mínimo viable (MVP) muy sólido, pero ya tenemos en la mira las próximas mejoras:
1.  **El servidor duerme:** Como estamos usando un servidor gratuito en la nube para el backend, si nadie usa la página por 15 minutos, el sistema se "duerme". Al primer clic después de un rato, puede demorar unos segundos en reaccionar. *(Solución futura: adquirir un plan básico de servidor).*
2.  **Subir fotos desde el celular:** Actualmente pedimos un enlace (URL) para las fotos de las plantas. El próximo gran paso es conectar el sistema para que el compañero pueda tomarle la foto al árbol directamente desde la cámara y subirla.
3.  **Modo sin internet:** Sabemos que en el monte la señal es difícil. A futuro, queremos que el sistema guarde los datos en el celular y los sincronice solitos cuando el operario llegue al pueblo o agarre WiFi.

¡Bienvenidos a la red de Bosquesinos!
