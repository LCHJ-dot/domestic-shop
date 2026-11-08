# Architecture Overview

This project is organized as a modern e-commerce MVP with a browser-based storefront, a modular backend, and payment/order processing capabilities.

```mermaid
flowchart LR
    User[Customer] --> Web[Web Frontend\nHTML / JS / UI]
    User --> Admin[Store Admin]

    Web --> API[API Gateway / Backend]
    Admin --> API

    subgraph CoreServices[Core Services]
        Auth[Authentication\n& Session]
        Catalog[Product Catalog\nService]
        Cart[Cart & Checkout\nService]
        Orders[Order Service]
        Payments[Payment Gateway\nIntegration]
        Notify[Notification\nService]
    end

    API --> Auth
    API --> Catalog
    API --> Cart
    API --> Orders
    API --> Payments
    API --> Notify

    Catalog --> DB[(Product Database)]
    Cart --> DB
    Orders --> DB
    Payments --> DB
    Notify --> DB

    subgraph Integrations[External Services]
        WeChat[WeChat Pay]
        Alipay[Alipay]
        Email[Email / SMS]
        CDN[Static Assets / CDN]
    end

    Payments --> WeChat
    Payments --> Alipay
    Notify --> Email
    Web --> CDN

    subgraph DataLayer[Data & Storage]
        DB
        Files[(Images / Media Storage)]
    end

    Catalog --> Files
    Web --> Files

    Admin --> Dashboard[Admin Dashboard]
    Dashboard --> API
```

## Components

- Web Frontend: storefront and shopping experience for customers.
- API Gateway / Backend: central entry point that routes requests to different services.
- Authentication: handles login, session management, and user identity.
- Product Catalog: manages product inventory, categories, and listings.
- Cart & Checkout: calculates totals, validates orders, and prepares checkout sessions.
- Order Service: creates and tracks orders after successful purchase.
- Payment Gateway Integration: connects to WeChat Pay and Alipay for secure transactions.
- Notification Service: sends order updates, confirmations, and alerts.
- Data Layer: stores product, order, payment, and user-related information.
- External Integrations: payment platforms and messaging channels.

## Typical Flow

1. User browses products in the web frontend.
2. Frontend calls the API gateway for catalog, cart, and checkout data.
3. Order creation is validated and sent to the order service.
4. Payment service initiates a payment request to WeChat Pay or Alipay.
5. Order status and user notifications are updated after payment confirmation.
6. Admin can review activity and manage operations through the admin dashboard.
