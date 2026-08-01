# clasificador

## outcome (meds-ack) como esta hoy

- condicion: "la solicitud de medicamentos fue recibida"
- label: "meds-solicitud-recibida"
- instrucciones_de_extraccion: null

## outcome (meds-confirmed) como esta hoy

- condicion: "la solicitud de medicamentos fue confirmada"
- label: "meds-solicitud-confirmada"
- instrucciones_de_extraccion: "Extraé la fecha de entrega (ej: Jueves 16-04), el domicilio de entrega (arenales 1234), la cantidad (ej: 12) y el tipo de pañales (ej: plentiud G x 16)",

## outcome (meds-confirmed) como deberia estar

- condicion: "la solicitud de medicamentos fue confirmada"
- label: "meds-solicitud-confirmada"
- extraer:

```json
{
  "type": "object",
  "properties": {
    "deliveryDate": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
      "description": "fecha de entrega en formato YYYY-MM-DD"
    },
    "deliveryAddress": {
      "type": "string",
      "description": "domicilio de entrega completo"
    },
    "quantity": {
      "type": "number",
      "description": "cantidad de pañales, número entero"
    }
  },
  "required": ["deliveryDate", "deliveryAddress", "quantity"],
  "additionalProperties": false
}
```

JUEVES-16-04

YYYY-MM-DD

1816-04-16

```json
{
  "version": "1",
  "outcomes": [
    {
      "label": "meds-solicitud-confirmada",
      "condition": "El remitente confirma la solicitud de medicamentos/insumos e indica cuándo y dónde se entregan. Debe haber una confirmación afirmativa, no solo una consulta o un pedido de datos.",
      "examples": {
        "match": [
          "Hola, confirmamos tu pedido. Lo entregamos el 4/8 en Av. Rivadavia 1234, CABA. Son 3 cajas.",
          "Listo, queda agendado para mañana en la dirección de siempre (Corrientes 500, depto 3B). Van 2 unidades."
        ],
        "no_match": [
          "Recibimos tu solicitud, en las próximas horas te confirmamos fecha.",
          "¿Nos podés pasar la dirección de entrega así coordinamos?"
        ]
      },
      "extract": {
        "type": "object",
        "properties": {
          "deliveryDate": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "Fecha de entrega en formato YYYY-MM-DD. Resolver fechas relativas ('mañana', 'el martes') usando la fecha de recepción del mail."
          },
          "deliveryAddress": {
            "type": "string",
            "description": "Domicilio de entrega completo tal como aparece en el mail."
          },
          "quantity": {
            "type": "number",
            "description": "Cantidad de unidades a entregar, número entero."
          }
        },
        "required": ["deliveryDate", "deliveryAddress", "quantity"],
        "additionalProperties": false
      }
    },
    {
      "label": "meds-entrega-reprogramada",
      "condition": "El remitente informa que una entrega ya acordada se cambia a otra fecha. La entrega sigue en pie, solo se mueve la fecha.",
      "examples": {
        "match": [
          "No vamos a poder entregar mañana, lo pasamos al viernes 8/8. Misma dirección.",
          "Reprogramamos tu entrega para el 12 de agosto por un tema de stock."
        ],
        "no_match": [
          "Lamentablemente cancelamos el pedido, no tenemos stock.",
          "Confirmamos entrega para el jueves en Rivadavia 1234."
        ]
      },
      "extract": {
        "type": "object",
        "properties": {
          "newDeliveryDate": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "Nueva fecha de entrega en formato YYYY-MM-DD."
          },
          "reason": {
            "type": "string",
            "description": "Motivo de la reprogramación, si se menciona."
          }
        },
        "required": ["newDeliveryDate"],
        "additionalProperties": false
      }
    }
  ],
  "default": {
    "label": "unknown"
  }
}
```

---

```json
{
  "version": "1",
  "outcomes": [
    {
      "label": "diapers-confirmation",
      "condition": "El remitente confirma la solicitud de pañales junto con fecha de entrega, cantidad, direccion, etc".
      "examples": {
        "match": [
            "confirmo pedido con fecha de entrega el día:  JUEVES 16-04 Consta de: 12 PLENITUD PROTECT G X 16 Dirección de entrega:  ARENALES 2131  - CABA  - BUENOS AIRES código de pedido: 0001-00105771
        ],
        "no_match": [
            "Su último pedido se validó el día 09-04,Debe volver a comunicarse a partir del LUNES 04-05 para poder realizarlo, si intentamos gestionar la validación en el día de hoy la solicitud dará rechazada."
        ]
      },
      "extract": {
        "type": "object",
        "properties": {
          "deliveryDate": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "Fecha de entrega en formato YYYY-MM-DD. Resolver el año de la fecha o las fechas relativas ('mañana', 'el martes') usando la fecha de recepción del mail."
          },
          "deliveryAddress": {
            "type": "string",
            "description": "Domicilio de entrega completo tal como aparece en el mail. (ej: Av Maipu 1234 - CABA - BUENOS AIRES)"
          },
          "quantity": {
            "type": "number",
            "description": "Cantidad de unidades a entregar, número entero. (ej: 12)"
          },
          "product": {
            "type": "string",
            "description": "Nombre completo del producto tal como figura en el mail, incluyendo talle y unidades por paquete (ej: PLENITUD PROTECT G X 16)",
          },
          "orderNumber": {
            "type": "string",
            "description": "Número o Código de pedido (ej: 0001-00043132)"
          }

        },
        "required": ["deliveryDate", "deliveryAddress", "quantity", "product", "orderNumber"],
        "additionalProperties": false
      }
    },
    {
      "label": "meds-entrega-reprogramada",
      "condition": "El remitente informa que una entrega ya acordada se cambia a otra fecha. La entrega sigue en pie, solo se mueve la fecha.",
      "examples": {
        "match": [
          "No vamos a poder entregar mañana, lo pasamos al viernes 8/8. Misma dirección.",
          "Reprogramamos tu entrega para el 12 de agosto por un tema de stock."
        ],
        "no_match": [
          "Lamentablemente cancelamos el pedido, no tenemos stock.",
          "Confirmamos entrega para el jueves en Rivadavia 1234."
        ]
      },
      "extract": {
        "type": "object",
        "properties": {
          "newDeliveryDate": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "Nueva fecha de entrega en formato YYYY-MM-DD."
          },
          "reason": {
            "type": "string",
            "description": "Motivo de la reprogramación, si se menciona."
          }
        },
        "required": ["newDeliveryDate"],
        "additionalProperties": false
      }
    }
  ],
  "default": {
    "label": "unknown"
  }
}
```
