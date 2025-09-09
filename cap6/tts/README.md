# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 6 - Iteraciones 5, 6 y 7: Funcionalidades avanzadas
Código resultante de las iteraciones 5, 6 y 7 en el desarrollo del sistema según la planificación inicial establecida en la memoria de trabajo.
Sistema funcional de visualización con distribución MQTT y control CEC de dispositivos, con capacidades de presentación multimodal y administrable y configurable vía web.

### Funcionalidad TTS basada en Speaches
Se utiliza [Speaches](https://github.com/speaches-ai/speaches/) para obtener acceso a múltiples modelos de voz a través de una API uniforme.

Los modelos a los que Speaches proporciona acceso son principalmente [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), [Piper](https://github.com/rhasspy/piper) y [Whisper](https://github.com/openai/whisper). Kokoro y Piper permiten generar locuciones aparentemente naturales a partir de texto (TTS, _Text-to-speech_) usando modelos relativamente pequeños (~80 MB en disco y ~400 MB de uso de RAM). Whisper permite realizar tareas de transcripción y traduccion a partir de voz (STT, _Speech-to-text_ o ASR, _Automatic Speech Recognition_), pero estas últimas no se utilizan en el contexto de SPPTZE y sus modelos son mucho más pesados (entre ~40 MB - 1.5 GB en disco y ~1 GB - ~10 GB de uso de RAM). El registro de Speaches facilita el acceso a una gran cantidad (128 TTS y 175 ASR) de variantes de estos modelos.

La API de Speaches permite consultar los modelos instalados y los disponibles mediante los _endpoints_ `GET /v1/models` y `GET /v1/registry`, respectivamente. También es posible descargar e instalar cualquiera de los modelos disponbles mediante el _endpoint_ `POST /v1/models/<alias-o-id>`. Esto es precisamente lo que se hace en el script `ìnstall.sh`, haciendo que Speaches descargue aquellos modelos enumerados en `model_aliases.json` que no estén todavía instalados. Speaches descarga los modelos de sus respectivas páginas en [Hugging Face](https://huggingface.co/).

_Endpoints_ de documentación de la API de Speaches:
- `<SPEACHES_URL>/openapi.json` (esquema OpenAPI)
- `<SPEACHES_URL>/docs` (interfaz SwaggerUI)
- `<SPEACHES_URL>/redoc` (interfaz ReDoc)

A pesar de que SPPTZE use solo los modelos Piper, la ventaja de usar Speaches desde SPPTZE está en que permite acceder a todos estos modelos con una API uniforme y un solo contenedor, mientras que p.ej. con [Wyoming Piper](https://github.com/rhasspy/wyoming-piper) hubiese requerido un contenedor independiente para cada modelo.

## Uso
Para iniciar el servidor Speaches:
   ```bash
   docker compose -f speaches.yml up
   ```

## Tecnologías validadas
- **Texto a voz:** Speaches

