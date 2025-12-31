const { createClient } = require('@supabase/supabase-js');
const url = 'https://nqrthjyopokfrfvtbkch.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xcnRoanlvcG9rZnJmdnRia2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MTAxMzgsImV4cCI6MjA4MTM4NjEzOH0.AxEK_sEAV95RDnKrfwaGdm_3KIO9THq9cNPP5jBCauA';
const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.from('restaurants').select('id, name');
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

check();
