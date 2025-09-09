# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 6 - Iteraciones 5 y 6: Funcionalidads avanzadas
Código resultante de las iteraciones 3 y 4 del desarrollo del sistema según la planificación establecida en el apartado 3.4 de la memoria de trabajo

## Versión final del nodo de visualización
Presentación de llamadas de turno y control CEC de pantalla de acuerdo a los mensajes entregados al nodo por el bróker MQTT. Incorpora la presentación basada en plantillas personalizadas y la reproducción de locuciones TTS cuando acompañan a las llamadas de turno.

### Estructura del proyecto
```
player/
├── public/        # Recursos web estáticos
├── src/
│   ├── services/  # Relacionados con distribución MQTT, control CEC y renderizado de plantillas
│   └── player.js  # Servidor local del nodo de visualización
├── views/         # Plantillas EJS de la interfaz web del nodo de visualización
├── package.json   # Dependencias + scripts
└── .env-sample    # Plantilla de archivo .env para la configuración de entorno
```

## Requisitos
- Node.js >= 22.0.0
- Bróker MQTT (Eclipse Mosquitto, HiveMQ etc.)
- Servidor central SPPTZE

## Uso
1. **Configurar un entorno `.env` a partir del archivo de plantilla `.env-sample`**:
   ```bash
   # .env
   NODE_ENV=development
   
   # SOLO TIENE EFECTO SI EL HW NO ES UNA RPI
   #HW_SERIAL_NUMBER=
   
   # PUERTO PARA LA APP WEB
   APP_PORT=3001
   # PUERTO PARA LA CONEXIÓN WEBSOCKET APP WEB <-> JS NAVEGADOR
   # (DEBE SER DISTINTO AL PUERTO DE LA APP)
   WEBSOCKET_PORT=3030
   
   # INFORMACIÓN DEL BRÓKER MQTT
   # (APUNTAR AL MISMO BRÓKER QUE EL SERVIDOR CENTRAL)
   MQTT_BROKER_URL=mqtt://localhost:1883
   #MQTT_USER=
   #MQTT_PASS=
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar nodo**:
   ```bash
   npm start
   ```

## Scripts disponibles
- `npm start` - Inicia el nodo de visualización
- `npm run dev` - Inicia el nodo de visualización con `nodemon` para desarrollo

## Arquitectura
- **Cliente MQTT**: mqtt.js
- **WebSocket:** paquete npm websockets/ws en servidor local del nodo; API WebSocket en el navegador
- **Control CEC**: `cec-ctl` (en el paquete `v4l-utils` en distribuciones Debian)
