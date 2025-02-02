from ranking_system import ProductRankingSystem
import os
import json
from collections import defaultdict
import pandas as pd

def format_product_details(product_id, data, ranking_system):
    """Format product details with individual weight components"""
    product = ranking_system.products_df[ranking_system.products_df['id'] == int(product_id)].iloc[0]
    
    # Calculate individual scores
    new_in_score = ranking_system.calculate_new_in_score(product)
    bestseller_score = ranking_system.calculate_bestseller_score(product_id)
    stock_score = ranking_system.calculate_stock_based_score(product)
    sale_score = ranking_system.calculate_sale_item_score(product)
    slow_mover_score = ranking_system.calculate_slow_mover_score(product_id)
    
    return {
        'title': data['title'],
        'total_score': data['score'],
        'vendor': data['vendor'],
        'components': {
            'new_in': new_in_score,
            'bestseller': bestseller_score,
            'stock_based': stock_score,
            'sale_item': sale_score,
            'slow_mover': slow_mover_score
        }
    }

def main():
    # Initialize the ranking system
    current_dir = os.path.dirname(os.path.abspath(__file__))
    products_file = os.path.join(current_dir, 'products.csv')
    orders_file = os.path.join(current_dir, 'orders.csv')
    
    ranking_system = ProductRankingSystem(products_file, orders_file)
    
    # Update all product rankings
    ranking_system.update_all_rankings()
    
    # Get all products and group by collection
    all_products = ranking_system.get_ranked_products()
    collections = defaultdict(list)
    
    # Group products by collection and format their details
    for product_id, data in all_products:
        product = ranking_system.products_df[ranking_system.products_df['id'] == int(product_id)].iloc[0]
        collection = product['productType'] if not pd.isna(product['productType']) else 'Uncategorized'
        
        product_details = format_product_details(product_id, data, ranking_system)
        collections[collection].append({
            'product_id': product_id,
            **product_details
        })
    
    # Sort products within each collection by total score
    for collection in collections:
        collections[collection].sort(key=lambda x: x['total_score'], reverse=True)
    
    # Create the final output structure
    output = {
        'ranking_weights': ranking_system.weights,
        'configuration': ranking_system.config,
        'collections': dict(collections)
    }
    
    # Export to JSON with proper formatting
    output_file = os.path.join(current_dir, 'detailed_rankings.json')
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\nDetailed rankings have been exported to: {output_file}")
    print("\nRanking summary:")
    for collection, products in collections.items():
        print(f"\n{collection} ({len(products)} products):")
        for idx, product in enumerate(products[:5], 1):  # Show top 5 per collection
            print(f"\n{idx}. {product['title']}")
            print(f"   Total Score: {product['total_score']:.2f}")
            print("   Score Components:")
            for component, score in product['components'].items():
                if score != 0:  # Only show non-zero components
                    print(f"   - {component}: {score}")
        if len(products) > 5:
            print(f"   ... and {len(products) - 5} more products")

if __name__ == "__main__":
    main() 