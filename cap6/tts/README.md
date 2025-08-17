# SPPTZE
Sistema de Presentación para Pantallas de Turno en Zonas de Espera

## Capítulo 6 - Iteraciones 5, 6 y 7: Funcionalidades avanzadas
Código resultante de las iteraciones 5, 6 y 7 en el desarrollo del sistema según la planificación inicial establecida en la memoria de trabajo.
Sistema funcional de visualización con distribución MQTT y control CEC de dispositivos, con capacidades de presentación multimodal y administrable y configurable vía web.

### Funcionalidad TTS basada en Speaches
Se utiliza [Speaches](https://github.com/speaches-ai/speaches/) para obtener acceso a múltiples modelos de síntesis de voz a través de una API uniforme.
La API de Speaches permite consultar los modelos instalados y los disponibles mediante los endpoints `GET /v1/models` y `GET /v1/registry`, respectivamente. También es posible instalar cualquiera de los modelos disponbles mediante el endpoint `POST /v1/models/<alias-o-id>`. Esto es precisamente lo que se hace con el script `ìnstall.sh`, haciendo que Speaches descargue aquellos modelos declarados en `model_aliases.json` que no estén instalados. Speaches descarga los modelos de sus respectivas páginas en [Hugging Face](https://huggingface.co/) (evidentemente, el contenedor Speaches necesitará acceso a internet para que esto funcione).

Los modelos que Speaches proporciona son principalmente [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), [Piper](https://github.com/rhasspy/piper) y [Whisper](https://github.com/openai/whisper). Los modelos Kokoro y Piper permiten generar locuciones naturales a partir de texto usando modelos relativamente pequeños (~80 MB en memoria). Whisper permite realizar tareas de transcripción y traduccion a partir de voz (TTS, _Text-to-speech_ o ASR, _Automatic Speech Recognition_), pero estas últimas no se utilizan en el contexto de SPPTZE. El registro de Speaches facilita el acceso a gran cantidad de variantes de estos tres modelos.

A pesar de que SPPTZE use solo los modelos Piper, la ventaja de Speaches en el contexto de su uso desde SPPTZE está en que permite acceder a todos estos modelos con una API uniforme y un solo contenedor, mientras que con [Wyoming Piper](https://github.com/rhasspy/wyoming-piper) hubiese requerido un contenedor independiente para cada modelo.

## Tecnologías validadas
- **Texto a voz:** Speaches