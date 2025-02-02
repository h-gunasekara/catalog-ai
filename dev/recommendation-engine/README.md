# Product Ranking System

A sophisticated product ranking system that optimizes product visibility based on multiple factors and merchant-specific rules.

## Features

### Ranking Factors

#### Push Up (Boost Ranking)
- **New In** (+5): Products added within the last 30 days
- **Bestsellers** (+10): Top 10% of sales over the recent period
- **Slow Movers** (+3): Products with low but increasing sales
- **Low Stock** (+8): Urgency trigger for items with limited inventory
- **Trending** (+6): High recent views & add-to-carts but not yet bestsellers

#### Push Down (Reduce Ranking)
- **Out of Stock** (-50): Hide or deprioritize unavailable products
- **Sale Items** (-10): Prevent sale items from dominating the ranking

### Configurable Parameters
- New product threshold days
- Bestseller percentage threshold
- Low stock threshold
- Trending view threshold
- Sale discount threshold

## Installation

1. Clone the repository
2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

```python
from ranking_system import ProductRankingSystem

# Initialize the system
ranking_system = ProductRankingSystem('products.csv', 'orders.csv')

# Update all rankings
ranking_system.update_all_rankings()

# Get top ranked products
top_products = ranking_system.get_ranked_products(limit=10)
```

### Filtering Results

```python
# Get top products in a category
top_dresses = ranking_system.get_ranked_products(limit=5, category='Dress')

# Get top products from a vendor
top_gucci = ranking_system.get_ranked_products(limit=5, vendor='Gucci')
```

### Customizing Weights

```python
new_weights = {
    'new_in': 8,
    'bestseller': 15
}
ranking_system.update_weights(new_weights)
```

### Updating Configuration

```python
new_config = {
    'new_product_days': 45,
    'bestseller_percentage': 15
}
ranking_system.update_config(new_config)
```

### Exporting Rankings

```python
ranking_system.export_rankings_to_json('rankings.json')
```

## Data Format

### Required CSV Files

1. `products.csv`: Contains product information
   - id
   - title
   - vendor
   - productType
   - createdAt
   - variants.edges.node.inventoryQuantity
   - variants.edges.node.priceV2.amount
   - variants.edges.node.compareAtPriceV2.amount

2. `orders.csv`: Contains order information
   - product_id
   - quantity
   - created_at

## Contributing

Feel free to submit issues and enhancement requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 