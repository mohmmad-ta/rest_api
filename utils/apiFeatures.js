class APIFeatures {
    constructor(query, queryString) {
        this.query = query;
        this.queryString = queryString;
    }

    // filter() {
    //     const queryObj = { ...this.queryString };
    //     const excludedFields = ['name', 'fields', 'page', 'limit', 'sort'];
    //     excludedFields.forEach(el => delete queryObj[el]);
    //
    //     this.query = this.query.find(queryObj); // ✅ fix here
    //     return this;
    // }
    filter() {
        const queryObj = { ...this.queryString };
        const excludedFields = ['name', 'fields', 'page', 'limit', 'sort'];
        excludedFields.forEach(el => delete queryObj[el]);

        // Convert operators to MongoDB syntax
        let queryStr = JSON.stringify(queryObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt|ne)\b/g, match => `$${match}`);

        // Convert number-like strings to numbers
        const parsedQuery = JSON.parse(queryStr, (key, value) => {
            if (typeof value === 'string' && !isNaN(value)) {
                return Number(value);
            }
            return value;
        });

        this.query = this.query.find(parsedQuery);
        return this;
    }

    sort() {
        if (this.queryString.sort) {
            const sortBy = this.queryString.sort.split(',').join(' ');
            this.query = this.query.sort(sortBy);
        } else {
            this.query = this.query.sort('-createdAt');
        }
        return this;
    }

    limitFields() {
        if (this.queryString.fields) {
            const fields = this.queryString.fields.split(',').join(' ');
            this.query = this.query.select(fields);
        } else {
            this.query = this.query.select('-__v');
        }
        return this;
    }

    paginate() {
        const page = this.queryString.page * 1 || 1;
        const limit = this.queryString.limit * 1 || 100;
        const skip = (page - 1) * limit;
        this.query = this.query.skip(skip).limit(limit);
        return this;
    }
}

module.exports = APIFeatures;
