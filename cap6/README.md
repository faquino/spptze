# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 6 - Iteraciones 5 y 6: Funcionalidades avanzadas
Código resultante de las iteraciones 5 y 6 en el desarrollo del sistema según la planificación inicial establecida en la memoria de trabajo.
Sistema funcional de visualización con distribución MQTT y control CEC de dispositivos, con capacidades de presentación multimodal y administrable y configurable vía web.

### Iteración 5: Presentación multimodal
- Integración de síntesis de voz mediante Speaches
- Implementación de plantillas de presentación

### Iteración 6: Configuración, personalización y monitorización
- Gestión de plantillas de presentación
- Interfaz de administración web AdminJS

### Entregables
- `cap6/player` - Nodo de visualización
- `cap6/server` - Servidor central

## Estructura de carpetas
```
cap6/
├── player/       # Nodo de visualización con MQTT, control CEC y presentación personalizable
├── server/       # Servidor central con MQTT
└── tts/          # Configuración contenedor Speaches para text-to-speech
```

## Tecnologías validadas
- **Síntesis de voz**: Speaches
- **Panel admin**: AdminJS