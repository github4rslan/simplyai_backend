import { db } from "../config/knex.js";

/**
 * Base model class with common database operations
 */
export class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  /**
   * Find all records with optional filters
   */
  async findAll(filters = {}, options = {}) {
    let query = this.db(this.tableName);

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.where(key, value);
      }
    });

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }

    // Apply ordering
    if (options.orderBy) {
      const { column, direction = "asc" } = options.orderBy;
      query = query.orderBy(column, direction);
    }

    return await query;
  }

  /**
   * Find one record by ID
   */
  async findById(id) {
    return await this.db(this.tableName).where({ id }).first();
  }

  /**
   * Find one record by filter
   */
  async findOne(filters) {
    let query = this.db(this.tableName);
    Object.entries(filters).forEach(([key, value]) => {
      query = query.where(key, value);
    });
    return await query.first();
  }

  /**
   * Create a new record
   */
  async create(data) {
    const [id] = await this.db(this.tableName).insert(data);
    return await this.findById(id);
  }

  /**
   * Update a record by ID
   */
  async updateById(id, data) {
    await this.db(this.tableName).where({ id }).update(data);
    return await this.findById(id);
  }

  /**
   * Update records by filter
   */
  async update(filters, data) {
    let query = this.db(this.tableName);
    Object.entries(filters).forEach(([key, value]) => {
      query = query.where(key, value);
    });
    await query.update(data);
    return await this.findAll(filters);
  }

  /**
   * Delete a record by ID
   */
  async deleteById(id) {
    return await this.db(this.tableName).where({ id }).delete();
  }

  /**
   * Delete records by filter
   */
  async delete(filters) {
    let query = this.db(this.tableName);
    Object.entries(filters).forEach(([key, value]) => {
      query = query.where(key, value);
    });
    return await query.delete();
  }

  /**
   * Count records with optional filters
   */
  async count(filters = {}) {
    let query = this.db(this.tableName);
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.where(key, value);
      }
    });
    const result = await query.count("* as count").first();
    return parseInt(result.count);
  }

  /**
   * Execute a raw query (use sparingly)
   */
  async raw(sql, bindings = []) {
    return await this.db.raw(sql, bindings);
  }
}

