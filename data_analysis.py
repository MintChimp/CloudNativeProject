import matplotlib

matplotlib.use("Agg")
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
import numpy as np


def run_analysis():
    # Load the dataset
    # Make sure All_Diets.csv is in the same directory
    try:
        df = pd.read_csv("All_Diets.csv")
    except FileNotFoundError:
        print("Error: All_Diets.csv not found.")
        return

    # 1. Data Cleaning: Handle missing values
    # We fill numeric columns with their mean
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].mean())

    # 2. Calculate average macronutrient content per diet type
    avg_macros = df.groupby("Diet_type")[["Protein(g)", "Carbs(g)", "Fat(g)"]].mean()
    print("--- Average Macronutrients per Diet ---")
    print(avg_macros)

    # 3. Top 5 protein-rich recipes for each diet type
    top_protein = (
        df.sort_values("Protein(g)", ascending=False).groupby("Diet_type").head(5)
    )

    # 4. Diet type with highest protein content (on average)
    highest_protein_diet = avg_macros["Protein(g)"].idxmax()
    print(f"\nDiet type with highest average protein: {highest_protein_diet}")

    # 5. New Metrics: Ratios
    # Adding a small epsilon to avoid division by zero
    df["Protein_to_Carbs_ratio"] = df["Protein(g)"] / (df["Carbs(g)"] + 0.001)
    df["Carbs_to_Fat_ratio"] = df["Carbs(g)"] / (df["Fat(g)"] + 0.001)

    # --- Visualizations ---

    # Bar Chart: Average Protein by Diet Type
    plt.figure(figsize=(10, 6))
    sns.barplot(x=avg_macros.index, y=avg_macros["Protein(g)"], palette="viridis")
    plt.title("Average Protein (g) by Diet Type")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig("avg_protein_bar.png")
    plt.show()

    # Heatmap: Macronutrient Relationship
    plt.figure(figsize=(8, 6))
    sns.heatmap(avg_macros.corr(), annot=True, cmap="coolwarm")
    plt.title("Correlation Heatmap of Macronutrients")
    plt.savefig("macro_heatmap.png")
    plt.show()

    # Scatter Plot: Top Protein Recipes vs Cuisine
    plt.figure(figsize=(12, 7))
    sns.scatterplot(
        data=top_protein, x="Cuisine_type", y="Protein(g)", hue="Diet_type", s=100
    )
    plt.title("Top 5 Protein-Rich Recipes by Cuisine and Diet")
    plt.xticks(rotation=45)
    plt.legend(bbox_to_anchor=(1.05, 1), loc="upper left")
    plt.tight_layout()
    plt.savefig("top_protein_scatter.png")
    plt.show()


if __name__ == "__main__":
    run_analysis()
