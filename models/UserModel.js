import { BaseModel } from "./BaseModel.js";

/**
 * User/Profile model
 */
export class UserModel extends BaseModel {
  constructor() {
    super("profiles");
  }

  /**
   * Find user by email
   */
  async findByEmail(email) {
    return await this.findOne({ email });
  }

  /**
   * Find users by role
   */
  async findByRole(role) {
    return await this.findAll({ role });
  }

  /**
   * Update last activity timestamp
   */
  async updateLastActivity(userId) {
    return await this.updateById(userId, {
      last_activity: this.db.fn.now(),
    });
  }
}

export default new UserModel();

