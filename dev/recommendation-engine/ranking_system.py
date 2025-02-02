import pandas as pd
from datetime import datetime, timedelta
import json
from datetime import timezone

class ProductRankingSystem:
    def __init__(self, products_file, orders_file):
        """Initialize the ranking system with product and order data."""
        self.products_df = pd.read_csv(products_file)
        self.orders_df = pd.read_csv(orders_file)
        
        # Clean up Shopify GID format from product IDs in orders
        self.orders_df['product_id'] = self.orders_df['lineItems.edges.node.variant.product.id'].apply(
            lambda x: int(x.split('/')[-1]) if isinstance(x, str) else x
        )
        
        # Map quantity to the correct column
        self.orders_df['quantity'] = self.orders_df['lineItems.edges.node.quantity']
        
        # Convert createdAt to UTC timezone
        self.orders_df['created_at'] = pd.to_datetime(self.orders_df['createdAt']).dt.tz_convert('UTC')
        
        self.ranking_scores = {}
        
        # Default weights for ranking factors
        self.weights = {
            'new_in': 5,
            'bestseller': 10,
            'slow_mover': 3,
            'low_stock': 8,
            'trending': 15,  # Increased weight for trending items
            'out_of_stock': -50,
            'sale_item': -10
        }
        
        # Configuration parameters
        self.config = {
            'new_product_days': 30,
            'bestseller_percentage': 10,
            'low_stock_threshold': 50,
            'trending_period_days': 7,  # Period to check for trending status
            'trending_threshold': 2.0,  # Minimum ratio of recent to previous sales to be considered trending
            'sale_discount_threshold': 15
        }

    def get_current_time_utc(self):
        """Get current time in UTC."""
        return datetime.now(timezone.utc)

    def calculate_new_in_score(self, product):
        """Calculate score based on product age."""
        created_date = pd.to_datetime(product['createdAt']).tz_convert('UTC')
        days_since_creation = (self.get_current_time_utc() - created_date).days
        return self.weights['new_in'] if days_since_creation <= self.config['new_product_days'] else 0

    def calculate_bestseller_score(self, product_id):
        """Calculate score based on sales performance."""
        # Get sales data for the product
        product_orders = self.orders_df[self.orders_df['product_id'] == product_id]
        if len(product_orders) > 0:
            total_sales = product_orders['quantity'].sum()
            # Compare against overall sales distribution
            all_sales = self.orders_df.groupby('product_id')['quantity'].sum()
            if total_sales >= all_sales.quantile(1 - (self.config['bestseller_percentage'] / 100)):
                return self.weights['bestseller']
        return 0

    def calculate_stock_based_score(self, product):
        """Calculate score based on inventory levels."""
        inventory = product['variants.edges.node.inventoryQuantity']
        if inventory <= 0:
            return self.weights['out_of_stock']
        elif inventory <= self.config['low_stock_threshold']:
            return self.weights['low_stock']
        return 0

    def calculate_sale_item_score(self, product):
        """Calculate score for items on sale."""
        regular_price = float(product['variants.edges.node.compareAtPriceV2.amount'])
        sale_price = float(product['variants.edges.node.priceV2.amount'])
        if regular_price > 0:
            discount_percentage = ((regular_price - sale_price) / regular_price) * 100
            if discount_percentage >= self.config['sale_discount_threshold']:
                return self.weights['sale_item']
        return 0

    def calculate_slow_mover_score(self, product_id):
        """Calculate score for slow-moving items with increasing sales."""
        current_time = self.get_current_time_utc()
        recent_orders = self.orders_df[
            (self.orders_df['product_id'] == product_id) &
            (self.orders_df['created_at'] > (current_time - timedelta(days=30)))
        ]
        if len(recent_orders) > 0:
            recent_sales = recent_orders['quantity'].sum()
            older_orders = self.orders_df[
                (self.orders_df['product_id'] == product_id) &
                (self.orders_df['created_at'] <= (current_time - timedelta(days=30)))
            ]
            if len(older_orders) > 0:
                older_sales = older_orders['quantity'].sum()
                if recent_sales > older_sales and older_sales < self.orders_df['quantity'].mean():
                    return self.weights['slow_mover']
        return 0

    def calculate_trending_score(self, product_id):
        """Calculate trending score based on recent sales surge."""
        current_time = self.get_current_time_utc()
        trending_period = timedelta(days=self.config['trending_period_days'])
        
        # Get recent orders within trending period
        recent_orders = self.orders_df[
            (self.orders_df['product_id'] == product_id) &
            (self.orders_df['created_at'] > (current_time - trending_period))
        ]
        
        # Get previous period orders
        previous_orders = self.orders_df[
            (self.orders_df['product_id'] == product_id) &
            (self.orders_df['created_at'] <= (current_time - trending_period)) &
            (self.orders_df['created_at'] > (current_time - (trending_period * 2)))
        ]
        
        recent_sales = recent_orders['quantity'].sum() if len(recent_orders) > 0 else 0
        previous_sales = previous_orders['quantity'].sum() if len(previous_orders) > 0 else 0
        
        # Calculate sales ratio
        if previous_sales > 0:
            sales_ratio = recent_sales / previous_sales
            if sales_ratio >= self.config['trending_threshold']:
                return self.weights['trending']
        # If no previous sales but recent sales exist, consider it trending
        elif recent_sales > 0:
            return self.weights['trending']
            
        return 0

    def calculate_ranking_score(self, product):
        """Calculate the total ranking score for a product."""
        product_id = product['id']
        score = 0
        
        # Calculate individual scores
        score += self.calculate_new_in_score(product)
        score += self.calculate_bestseller_score(product_id)
        score += self.calculate_stock_based_score(product)
        score += self.calculate_sale_item_score(product)
        score += self.calculate_slow_mover_score(product_id)
        score += self.calculate_trending_score(product_id)  # Add trending score
        
        # Store the score with timestamp
        self.ranking_scores[product_id] = {
            'score': score,
            'updated_at': self.get_current_time_utc().isoformat(),
            'title': product['title'],
            'vendor': product['vendor']
        }
        
        return score

    def update_all_rankings(self):
        """Update ranking scores for all products."""
        for _, product in self.products_df.iterrows():
            self.calculate_ranking_score(product)

    def get_ranked_products(self, limit=None, category=None, vendor=None):
        """Get ranked products with optional filtering."""
        ranked_products = sorted(
            self.ranking_scores.items(),
            key=lambda x: x[1]['score'],
            reverse=True
        )
        
        if category:
            ranked_products = [p for p in ranked_products if self.products_df[
                self.products_df['id'] == int(p[0])
            ]['productType'].iloc[0] == category]
            
        if vendor:
            ranked_products = [p for p in ranked_products if p[1]['vendor'] == vendor]
            
        if limit:
            ranked_products = ranked_products[:limit]
            
        return ranked_products

    def export_rankings_to_json(self, filename='product_rankings.json'):
        """Export ranking scores to a JSON file."""
        with open(filename, 'w') as f:
            json.dump(self.ranking_scores, f, indent=2)

    def update_weights(self, new_weights):
        """Update the weights used for ranking calculations."""
        self.weights.update(new_weights)
        # Recalculate all rankings with new weights
        self.update_all_rankings()

    def update_config(self, new_config):
        """Update the configuration parameters."""
        self.config.update(new_config)
        # Recalculate all rankings with new configuration
        self.update_all_rankings() 