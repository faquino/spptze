# Diccionario de Datos - Base de Datos SPPTZE

*Generado el 30/7/2025, 18:02:45 por generate-data-dict.js a partir del modelo Sequelize*

## Índice de Tablas

- [display_nodes](#display-nodes)
- [display_templates](#display-templates)
- [external_systems](#external-systems)
- [hierarchies](#hierarchies)
- [hierarchy_levels](#hierarchy-levels)
- [locations](#locations)
- [messages](#messages)
- [message_deliveries](#message-deliveries)
- [node_location_mapping](#node-location-mapping)
- [service_points](#service-points)
- [service_point_location_mapping](#service-point-location-mapping)

---

<a id="display-nodes"></a>
## display_nodes

Nodos de visualización inventariados en el sistema

**Modelo:** DisplayNode  
**Tabla:** display_nodes  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY, isMQTTCompatible (custom) |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `description` | TEXT | - | - | - |
| `serialNumber` | VARCHAR(32) | - | - | - |
| `macAddress` [ℹ️](## "Seis bytes codificados en hexadecimal, sin separadores") | VARCHAR(12) | - | - | isValidMAC (custom) |
| `hostname` | VARCHAR(255) | - | - | - |
| `hardwareModel` | VARCHAR(32) | - | - | - |
| `active` | BOOLEAN | - | true | - |
| `lastSeen` | DATE | - | - | - |
| `templateOverrideId` [ℹ️](## "Permite anular la lógica de asignación de plantilla basada en la jerarquía de ubicaciones") | VARCHAR(16) | FK → `display_templates.id` | - | - |
| `createdAt` | DATE | - | undefined | - |

#### Índices

- **Índice 1:** serial_number (UNIQUE)
- **Índice 2:** active
- **Índice 3:** template_override_id
- **Índice 4:** last_seen

#### Funciones Auxiliares

- **getEffectiveTemplate:** Función auxiliar del modelo

---

<a id="display-templates"></a>
## display_templates

Plantillas que definen apariencia y comportamiento de la presentación en los nodos de visualización

**Modelo:** DisplayTemplate  
**Tabla:** display_templates  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `description` | TEXT | - | - | - |
| `config` | JSONTYPE | - | {} | isValidConfig (custom) |

---

<a id="external-systems"></a>
## external_systems

Sistemas externos que envían mensajes a través de la API

**Modelo:** ExternalSystem  
**Tabla:** external_systems  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `description` | TEXT | - | - | - |
| `apiKey` | VARCHAR(64) | - | - | - |
| `allowedIPs` [ℹ️](## "Lista de IPs o rangos CIDR autorizados para el sistema") | JSONTYPE | - | - | isValidIPArray (custom) |
| `defaultTargetType` | VARCHAR(1) | - | - | NOT NULL, Valores: [["S","L"]] |
| `defaultChannel` | VARCHAR(16) | - | "calls" | Valores: [["calls","info","emergency","announcements"]] |
| `messageFormat` | JSONTYPE | - | - | - |
| `ticketField` | VARCHAR(20) | - | "ticket" | - |
| `targetField` | VARCHAR(20) | - | "target" | - |
| `contentField` | VARCHAR(20) | - | "content" | - |
| `active` | BOOLEAN | - | true | - |

---

<a id="hierarchies"></a>
## hierarchies

Jerarquías organizativas definidas en el sistema

**Modelo:** Hierarchy  
**Tabla:** hierarchies  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `description` | TEXT | - | - | - |

---

<a id="hierarchy-levels"></a>
## hierarchy_levels

Niveles definidos por cada jerarquía organizativa

**Modelo:** HierarchyLevel  
**Tabla:** hierarchy_levels  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY |
| `hierarchyId` | VARCHAR(16) | FK → `hierarchies.id` | - | NOT NULL |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `description` | TEXT | - | - | - |
| `prevId` [ℹ️](## "Referencia al nivel previo de la jerarquía") | VARCHAR(16) | FK → `hierarchy_levels.id` | - | - |

#### Índices

- **Índice 1:** hierarchy_id, name (UNIQUE)
- **Índice 2:** prev_id (UNIQUE)

#### Validaciones de Modelo

- **validatePrevLevel:** Validación personalizada
- **validateNoCycles:** Validación personalizada

#### Funciones Auxiliares

- **getDepth:** Función auxiliar del modelo
- **getPath:** Función auxiliar del modelo

---

<a id="locations"></a>
## locations

Ubicaciones inventariadas en la jerarquía organizativa

**Modelo:** Location  
**Tabla:** locations  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY, isMQTTCompatible (custom) |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `description` | TEXT | - | - | - |
| `hierarchyId` [ℹ️](## "(DN) Referencia a la jerarquía a la que pertenece la ubicación") | VARCHAR(16) | FK → `hierarchies.id` | - | NOT NULL |
| `hierarchyLevelId` | VARCHAR(16) | FK → `hierarchy_levels.id` | - | NOT NULL |
| `parentId` [ℹ️](## "Referencia a la ubicación madre") | VARCHAR(16) | FK → `locations.id` | - | - |
| `templateId` | VARCHAR(16) | FK → `display_templates.id` | - | - |

#### Índices

- **Índice 1:** hierarchy_id
- **Índice 2:** hierarchy_level_id
- **Índice 3:** parent_id
- **Índice 4:** template_id

#### Validaciones de Modelo

- **validateParentHierarchy:** Validación personalizada
- **validateNoCycles:** Validación personalizada

#### Funciones Auxiliares

- **getEffectiveTemplate:** Función auxiliar del modelo
- **getDepth:** Función auxiliar del modelo
- **getPath:** Función auxiliar del modelo
- **getChildren:** Función auxiliar del modelo
- **getDescendants:** Función auxiliar del modelo

---

<a id="messages"></a>
## messages

Mensajes o llamadas de turno recibidos a través de la API

**Modelo:** Message  
**Tabla:** messages  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY |
| `channel` | VARCHAR(16) | - | "calls" | Valores: [["calls","info","emergency","announcements"]] |
| `ticket` | VARCHAR(16) | - | - | - |
| `content` | TEXT | - | - | NOT NULL |
| `priority` | INTEGER | - | 1 | Mínimo: 1, Máximo: 5 |
| `targetLocationId` | VARCHAR(16) | FK → `locations.id` | - | - |
| `targetServicePointId` | VARCHAR(16) | FK → `service_points.id` | - | - |
| `sourceSystemId` | VARCHAR(16) | FK → `external_systems.id` | - | - |
| `ogMessageId` [ℹ️](## "Referencia al mensaje original en caso de repetición") | VARCHAR(16) | FK → `messages.id` | - | - |
| `externalRef` [ℹ️](## "Identificador del evento/petición/... del mensaje en el sistema externo") | VARCHAR(36) | - | - | - |
| `createdAt` | DATE | - | undefined | - |
| `retractedAt` | DATE | - | - | - |
| `expiresAt` | DATE | - | - | - |

#### Índices

- **Índice 1:** target_location_id
- **Índice 2:** target_service_point_id
- **Índice 3:** source_system_id
- **Índice 4:** og_message_id
- **Índice 5:** created_at
- **Índice 6:** retracted_at
- **Índice 7:** expires_at
- **Índice 8:** channel
- **Índice 9:** priority

#### Validaciones de Modelo

- **hasOneTarget:** Validación personalizada

---

<a id="message-deliveries"></a>
## message_deliveries

Registros de entrega de mensajes a nodos de visualización

**Modelo:** MessageDelivery  
**Tabla:** message_deliveries  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `messageId` | VARCHAR(16) | PK, FK → `messages.id` | - | PRIMARY KEY |
| `nodeId` | VARCHAR(16) | PK, FK → `display_nodes.id` | - | PRIMARY KEY |
| `createdAt` [ℹ️](## "Timestamp de creación de la tupla (RTC servidor central)") | DATE | - | undefined | NOT NULL |
| `deliveredAt` [ℹ️](## "Timestamp de entrega del mensaje al nodo (RTC nodo de visualización)") | DATE | - | - | - |
| `displayedAt` [ℹ️](## "Timestamp de visualización del mensaje en el nodo (RTC nodo de visualización)") | DATE | - | - | - |
| `acknowledgedAt` [ℹ️](## "Timestamp de entrega del mensaje de ACK del nodo (RTC servidor central)") | DATE | - | - | - |
| `retractedAt` [ℹ️](## "Timestamp del informe de retirada del mensaje por parte del nodo (RTC servidor central)") | DATE | - | - | - |
| `acknowledged` | VIRTUAL | - | - | - |

#### Índices

- **Índice 1:** created_at
- **Índice 2:** delivered_at
- **Índice 3:** displayed_at
- **Índice 4:** acknowledged_at
- **Índice 5:** retracted_at

#### Validaciones de Modelo

- **ackAfterCreate:** Validación personalizada
- **displayAfterDelivery:** Validación personalizada

---

<a id="node-location-mapping"></a>
## node_location_mapping

Tabla de relación M:N entre DisplayNode y Location

**Modelo:** NodeLocationMapping  
**Tabla:** node_location_mapping  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `nodeId` | VARCHAR(16) | PK, FK → `display_nodes.id` | - | PRIMARY KEY |
| `locationId` | VARCHAR(16) | PK, FK → `locations.id` | - | PRIMARY KEY |
| `showChildren` [ℹ️](## "El nodo debe mostrar también los mensajes dirigidos a ubicaciones descendientes") | BOOLEAN | - | true | - |
| `active` | BOOLEAN | - | true | NOT NULL |

---

<a id="service-points"></a>
## service_points

Agrupaciones lógicas de ubicaciones referidas por algún sistema externo

**Modelo:** ServicePoint  
**Tabla:** service_points  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `id` | VARCHAR(16) | PK | - | NOT NULL, PRIMARY KEY, isMQTTCompatible (custom) |
| `name` | VARCHAR(80) | - | - | NOT NULL |
| `sourceSystemId` | VARCHAR(16) | FK → `external_systems.id` | - | NOT NULL |
| `externalId` [ℹ️](## "ID por el que el sistema externo conoce y se refiere al punto de servicio") | VARCHAR(36) | - | - | NOT NULL |
| `active` | BOOLEAN | - | true | - |

#### Índices

- **Índice 1:** source_system_id, external_id (UNIQUE)
- **Índice 2:** source_system_id

---

<a id="service-point-location-mapping"></a>
## service_point_location_mapping

Tabla de relación M:N entre ServicePoint y Location

**Modelo:** ServicePointLocationMapping  
**Tabla:** service_point_location_mapping  
**Timestamps:** No

### Campos

| Campo | Tipo | Restricciones | Defecto | Validaciones |
|-------|------|---------------|---------|--------------|
| `servicePointId` | VARCHAR(16) | PK, FK → `service_points.id` | - | PRIMARY KEY |
| `locationId` | VARCHAR(16) | PK, FK → `locations.id` | - | PRIMARY KEY |

---

