import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ejbmcqnsvdjhexozyhdx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqYm1jcW5zdmRqaGV4b3p5aGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODc4OTUsImV4cCI6MjA5MTc2Mzg5NX0.4swmJc5aUgG4AsBi64tmbZip4aGjgPgTIWDRlErrtfc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
