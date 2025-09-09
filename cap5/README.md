# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 5 - Iteraciones 3 y 4: Funcionalidades básicas
Código resultante de las iteraciones 3 y 4 en el desarrollo del sistema según la planificación inicial establecida en la memoria de trabajo. Sistema básico funcional de visualización con distribución MQTT y control CEC de dispositivos.

### Iteración 3: Visualización básica
- Desarrollo inicial del nodo de visualización
- Implementación de comunicaciones MQTT en servidor central y nodo de visualización
- Implementación de la presentación de llamadas de turno

### Iteración 4: Control de dispositivos
- Implementación del control HDMI-CEC de pantalla del nodo de visualización
- Gestión remota de pantallas desde el servidor central

### Entregables
- `cap5/player` - Nodo de visualización
- `cap5/server` - Servidor central

## Estructura de carpetas
```
cap5/
├── player/    # Nodo de visualización con MQTT y control CEC
└── server/    # Servidor central con MQTT
```

## Tecnologías validadas
- **MQTT:** mqtt.js
- **WebSocket:**
- **HDMI-CEC** *Con matices

