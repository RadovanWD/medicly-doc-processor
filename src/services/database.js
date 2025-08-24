import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

pool.on('error', err => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Inserts a processed blog post into the database.
 * @param {object} postData - The structured data from the docx file.
 */
export async function insertPost(postData) {
  const {
    title,
    slug,
    category,
    excerpt,
    content,
    image,
    metaTitle,
    metaDescription,
    keywords,
    author,
    imageTitle,
  } = postData;

  const insertQuery = `
    INSERT INTO blogs(
      title, slug, category, excerpt, content, image, meta_title,
      meta_description, keywords, author, image_title
    )
    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id, slug;
  `;

  const client = await pool.connect();
  try {
    const res = await client.query(insertQuery, [
      title,
      slug,
      category,
      excerpt,
      content,
      image,
      metaTitle,
      metaDescription,
      keywords,
      author,
      imageTitle,
    ]);
    return res.rows[0];
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
