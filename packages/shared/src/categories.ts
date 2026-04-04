export interface CategoryTemplate {
  name: string;
  criticalAttributes: string[];
  niceToHave: string[];
}

export const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    name: "Apparel",
    criticalAttributes: ["color", "size", "material", "gender"],
    niceToHave: ["fit", "pattern", "sleeveLength", "ageGroup"],
  },
  {
    name: "Electronics",
    criticalAttributes: ["brand", "model", "screenSize", "storage", "ram"],
    niceToHave: ["processor", "os", "connectivity", "warranty"],
  },
  {
    name: "Footwear",
    criticalAttributes: ["size", "color", "material", "gender"],
    niceToHave: ["heelHeight", "soleType", "width"],
  },
  {
    name: "Furniture",
    criticalAttributes: ["dimensions", "material", "color"],
    niceToHave: ["weight", "assembly", "maxLoadWeight"],
  },
  {
    name: "Beauty/Skincare",
    criticalAttributes: ["volume", "weight", "skinType", "ingredients"],
    niceToHave: ["shade", "spf", "certifications"],
  },
  {
    name: "Food & Beverage",
    criticalAttributes: ["weight", "ingredients", "allergens"],
    niceToHave: ["nutrition", "servingSize", "origin"],
  },
  {
    name: "Sporting Goods",
    criticalAttributes: ["size", "material", "sport", "gender"],
    niceToHave: ["level", "weight", "compatibility"],
  },
  {
    name: "Automotive Parts",
    criticalAttributes: ["compatibility", "partNumber"],
    niceToHave: ["material", "weight", "warranty"],
  },
  {
    name: "Home & Garden",
    criticalAttributes: ["dimensions", "material", "power", "voltage"],
    niceToHave: ["color", "compatibility"],
  },
];
