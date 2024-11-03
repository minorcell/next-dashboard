'use server';

import { z } from "zod";  // 1. 引入zod库，用于定义数据类型和验证数据
import { sql } from '@vercel/postgres'; // 7. 引入postgres库，用于连接数据库
import { revalidatePath } from 'next/cache'; // 9. 引入revalidatePath函数，用于重新验证路径
import { redirect } from 'next/navigation'; // 11. 引入redirect函数，用于重定向


import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}

// 2. 定义表单数据类型
const FormSchema = z.object({
    id: z.string(),
    customerId: z.string(),
    amount: z.coerce.number(), // 把字符串强制转换为数字
    status: z.enum(['pending', 'paid']),  // 枚举类型，只能是pending或paid
    date: z.string(),
});

// 3. 定义创建发票的表单数据类型，不包括id和date字段
const CreateInvoice = FormSchema.omit({ id: true, date: true });


/**
 * 创建一个新的发票
 * @param formData 表单数据
 */
export async function createInvoice(formData: FormData) {

    // 4. 解析表单数据，验证数据类型和格式
    const { customerId, amount, status } = CreateInvoice.parse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // 5. 将金额转换为美分，存储到数据库中， 避免浮点数问题
    const amountInCents = amount * 100;

    // 6. 创建格式化的时间，数据库中统一存储ISO格式的时间，方便查询和排序
    const date = new Date().toISOString().split('T')[0];

    // 8. 连接数据库，插入数据
    try {
        await sql`
          INSERT INTO invoices (customer_id, amount, status, date)
          VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    } catch (error) {
        return {
            message: 'Database Error: Failed to Create Invoice.',
        };
    }

    // 10. 根据指定路径刷新数据或更新缓存
    revalidatePath('/dashboard/invoices');

    // 12. 重定向到发票列表页面
    redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true });

/**
 * 更新一个发票
 * @param id 发票id
 */
export async function updateInvoice(id: string, formData: FormData) {
    const { customerId, amount, status } = UpdateInvoice.parse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    const amountInCents = amount * 100;

    try {
        await sql`
            UPDATE invoices
            SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
          `;
    } catch (error) {
        return { message: 'Database Error: Failed to Update Invoice.' };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

/**
 * 删除一个发票
 * @param id 发票id
 */
export async function deleteInvoice(id: string) {
    // throw new Error('Failed to Delete Invoice');
    try {
        await sql`DELETE FROM invoices WHERE id = ${id}`;
        revalidatePath('/dashboard/invoices');
        return { message: 'Deleted Invoice.' };
    } catch (error) {
        return { message: 'Database Error: Failed to Delete Invoice.' };
    }
}