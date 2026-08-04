# clasificador

```json
{
  "outcomes": [
    {
      "label": "diapers.confirmed",
      "condition": "El remitente confirma la solicitud de pañales junto con fecha de entrega, cantidad, direccion, etc",
      "examples": {
        "match": [
          "confirmo pedido con fecha de entrega el día:  JUEVES 16-04 Consta de: 12 MARCA PROTECT G X 16 Dirección de entrega:  CALLE FALSA 123  - CABA  - BUENOS AIRES código de pedido: 0001-00000000"
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
            "description": "Domicilio de entrega completo tal como aparece en el mail. (ej: Calle Falsa 123 - CABA - BUENOS AIRES)"
          },
          "quantity": {
            "type": "number",
            "description": "Cantidad de unidades a entregar, número entero. (ej: 12)"
          },
          "product": {
            "type": "string",
            "description": "Nombre completo del producto tal como figura en el mail, incluyendo talle y unidades por paquete (ej: MARCA PROTECT G X 16)"
          },
          "orderNumber": {
            "type": "string",
            "description": "Número o Código de pedido (ej: 0001-00000000)"
          }
        },
        "required": [
          "deliveryDate",
          "deliveryAddress",
          "quantity",
          "product",
          "orderNumber"
        ],
        "additionalProperties": false
      }
    }
  ],
  "default-outcome": {
    "label": "meds.unknown"
  }
}
```
