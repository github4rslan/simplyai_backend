import { BaseModel } from "./BaseModel.js";

/**
 * Subscription Plan model
 */
export class PlanModel extends BaseModel {
  constructor() {
    super("subscription_plans");
  }

  /**
   * Find active plans
   */
  async findActive() {
    return await this.findAll({ active: true }, { orderBy: { column: "sort_order", direction: "asc" } });
  }

  /**
   * Find free plans
   */
  async findFree() {
    return await this.findAll({ is_free: true });
  }

  /**
   * Find plan by name
   */
  async findByName(name) {
    return await this.findOne({ name });
  }
}

export default new PlanModel();

